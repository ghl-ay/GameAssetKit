import { z } from "zod";
import sharp from "sharp";
import ImageTracer from "imagetracerjs";
import type { ImageResult } from "./types";
import {
  blit,
  createRaw,
  decodeRaw,
  encodePng,
  encodeWebp,
  extractRaw,
  parseHexColor,
} from "./image-io";
import { removeColorBackground } from "./pixel-color-key";
import { findSpriteBoxes, gridSpriteBoxes } from "./sprite-split";
import { ANCHORS, anchorOffset, type Anchor } from "./anchor";
import {
  hashBuffer,
  lintAssets,
  normalizeFormat,
  type LintFile,
  type LintRules,
} from "./asset-lint";
import { bleedTransparent, unpremultiplyAlpha } from "./alpha-bleed";
import { packAtlas } from "./atlas";
import { REGION_SUFFIXES, nineSliceRegions, resolveBorders } from "./nine-slice";
import {
  applyPaletteMap,
  histogram,
  orderPalette,
  paletteSwatch,
  quantizePalette,
  rgbToHex,
  type RgbPair,
} from "./palette";
import { planSequence, resolveGrid } from "./sequence";
import { contentBox, nextPowerOfTwo } from "./trim";
import { extractVideoFrames } from "./video-to-frames";
import type { RawImage } from "./types";

export interface ToolParamSchema {
  [key: string]: z.ZodTypeAny;
}

/** One input image of a multi-image tool. */
export interface ToolInput {
  /** File name including its extension, e.g. "hero.png". */
  name: string;
  buffer: Buffer;
}

/**
 * Validated tool params. Values stay dynamically typed because every tool reads
 * them straight off `params`; the shape is enforced by `parseToolParams`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolParams = Record<string, any>;

interface BaseToolDef {
  name: string;
  title: string;
  description: string;
  /** Zod raw shape of the params (input image is passed separately) */
  params: ToolParamSchema;
}

/** Tool that processes one image at a time. */
export interface ToolDef extends BaseToolDef {
  multiInput?: false;
  /**
   * Process one image. `baseName` is the input file name without extension,
   * used to build result names.
   */
  run(
    input: Buffer,
    params: ToolParams,
    baseName: string
  ): Promise<ImageResult | ImageResult[]>;
}

/** Tool that consumes several images at once (atlas packing, batch linting). */
export interface MultiToolDef extends BaseToolDef {
  multiInput: true;
  /** Minimum number of inputs; entry points default to 2. */
  minInputs?: number;
  runMulti(
    inputs: ToolInput[],
    params: ToolParams,
    baseName: string
  ): Promise<ImageResult | ImageResult[]>;
}

export type AnyToolDef = ToolDef | MultiToolDef;

export function isMultiTool(tool: AnyToolDef): tool is MultiToolDef {
  return tool.multiInput === true;
}

const fitEnum = z.enum(["cover", "contain", "fill", "inside", "outside"]);

export const tools: Record<string, AnyToolDef> = {
  compress: {
    name: "compress",
    title: "图片压缩/格式转换",
    description:
      "压缩图片或转换格式(jpeg/webp/png)。quality 为 1-100;format 为 original 时保持原格式(png 不支持有损压缩,质量参数会被忽略)。",
    params: {
      format: z
        .enum(["original", "jpeg", "webp", "png"])
        .optional()
        .describe("输出格式,默认 original(保持原格式)"),
      quality: z.number().min(1).max(100).optional().describe("质量 1-100,默认 80"),
    },
    async run(input, params, baseName) {
      const meta = await sharp(input).metadata();
      const quality = params.quality ?? 80;
      const target =
        params.format === "original" || params.format === undefined
          ? meta.format ?? "png"
          : params.format;

      let pipe = sharp(input);
      let ext: string;
      let contentType: string;
      if (target === "jpeg" || target === "jpg") {
        pipe = pipe.jpeg({ quality, mozjpeg: true });
        ext = "jpg";
        contentType = "image/jpeg";
      } else if (target === "webp") {
        pipe = pipe.webp({ quality });
        ext = "webp";
        contentType = "image/webp";
      } else {
        pipe = pipe.png({ compressionLevel: 9 });
        ext = "png";
        contentType = "image/png";
      }

      const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
      return {
        name: `${baseName}.${ext}`,
        buffer: data,
        contentType,
        ext,
        width: info.width,
        height: info.height,
        originalWidth: meta.width,
        originalHeight: meta.height,
      };
    },
  },

  resize: {
    name: "resize",
    title: "调整尺寸",
    description:
      "调整图片尺寸。width/height 至少提供一个;fit 决定缩放策略(cover 裁剪填充 / contain 留白 / fill 拉伸 / inside 适配不裁剪 / outside 覆盖不裁剪),默认 inside。",
    params: {
      width: z.number().int().min(1).optional().describe("目标宽度(px)"),
      height: z.number().int().min(1).optional().describe("目标高度(px)"),
      fit: fitEnum.optional().describe("缩放策略,默认 inside"),
      withoutEnlargement: z
        .boolean()
          .optional()
        .describe("禁止放大(目标大于原图时保持原尺寸),默认 false"),
    },
    async run(input, params, baseName) {
      const width = params.width;
      const height = params.height;
      if (!width && !height) {
        throw new Error("width 和 height 至少提供一个");
      }
      const { data, info } = await sharp(input)
        .resize({
          width,
          height,
          fit: params.fit ?? "inside",
          withoutEnlargement: params.withoutEnlargement ?? false,
        })
        .toBuffer({ resolveWithObject: true });
      return {
        name: `${baseName}_${info.width}x${info.height}.png`,
        buffer: data,
        contentType: `image/${info.format}`,
        ext: info.format === "jpeg" ? "jpg" : info.format,
        width: info.width,
        height: info.height,
      };
    },
  },

  crop: {
    name: "crop",
    title: "裁剪",
    description: "按区域裁剪图片。left/top 为左上角坐标,width/height 为裁剪尺寸(均为 px)。",
    params: {
      left: z.number().int().min(0).describe("左上角 X 坐标"),
      top: z.number().int().min(0).describe("左上角 Y 坐标"),
      width: z.number().int().min(1).describe("裁剪宽度"),
      height: z.number().int().min(1).describe("裁剪高度"),
    },
    async run(input, params, baseName) {
      const { data, info } = await sharp(input)
        .extract({
          left: params.left,
          top: params.top,
          width: params.width,
          height: params.height,
        })
        .toBuffer({ resolveWithObject: true });
      return {
        name: `${baseName}_crop.png`,
        buffer: data,
        contentType: `image/${info.format}`,
        ext: info.format === "jpeg" ? "jpg" : info.format,
        width: info.width,
        height: info.height,
      };
    },
  },

  transform: {
    name: "transform",
    title: "旋转/翻转",
    description:
      "旋转与翻转。rotate 为顺时针角度(90/180/270,任意角度会扩展画布);flipH 水平镜像;flipV 垂直镜像。至少提供一个参数。",
    params: {
      rotate: z.number().optional().describe("顺时针旋转角度(度)"),
      flipH: z.boolean().optional().describe("水平翻转"),
      flipV: z.boolean().optional().describe("垂直翻转"),
    },
    async run(input, params, baseName) {
      const { rotate, flipH, flipV } = params;
      if (rotate === undefined && !flipH && !flipV) {
        throw new Error("rotate / flipH / flipV 至少提供一个");
      }
      let pipe = sharp(input);
      if (rotate !== undefined && rotate !== 0) {
        pipe = pipe.rotate(rotate, {
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        });
      }
      if (flipH) pipe = pipe.flop();
      if (flipV) pipe = pipe.flip();
      const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
      return {
        name: `${baseName}_transformed.png`,
        buffer: data,
        contentType: `image/${info.format}`,
        ext: info.format === "jpeg" ? "jpg" : info.format,
        width: info.width,
        height: info.height,
      };
    },
  },

  "background-remover": {
    name: "background-remover",
    title: "纯色背景扣除",
    description:
      "将纯色背景转为透明 PNG。默认以左上角像素为背景色,可用 color 指定;tolerance 为颜色容差 0-100(默认 10);contiguousOnly 为 true 时只移除与边缘相连的背景区域;feather 为边缘羽化 0-20px;edgeShrink 向内收缩边缘 0-20px。",
    params: {
      color: z.string().optional().describe("背景色,如 #ff0000;默认取左上角像素"),
      tolerance: z.number().min(0).max(100).optional().describe("容差 0-100,默认 10"),
      contiguousOnly: z.boolean().optional().describe("仅移除连通背景,默认 false"),
      feather: z.number().min(0).max(20).optional().describe("羽化半径 px,默认 0"),
      edgeShrink: z.number().min(0).max(20).optional().describe("边缘收缩 px,默认 0"),
      antiAlias: z.boolean().optional().describe("抗锯齿软边,默认 true"),
      chromaKey: z.boolean().optional().describe("色度键边缘精修(去色染),默认 true"),
      seedPoints: z
        .array(z.object({ x: z.number(), y: z.number() }))
        .optional()
        .describe("额外种子点(配合 contiguousOnly 从内部移除)"),
    },
    async run(input, params, baseName) {
      const img = await decodeRaw(input);
      removeColorBackground(img, {
        tolerance: params.tolerance ?? 10,
        contiguousOnly: params.contiguousOnly ?? false,
        targetColor: params.color ? parseHexColor(params.color) : undefined,
        feather: params.feather ?? 0,
        antiAlias: params.antiAlias ?? true,
        chromaKey: params.chromaKey ?? true,
        seedPoints: params.seedPoints,
        edgeShrink: params.edgeShrink ?? 0,
      });
      const buffer = await encodePng(img);
      return {
        name: `${baseName}.png`,
        buffer,
        contentType: "image/png",
        ext: "png",
        width: img.width,
        height: img.height,
      };
    },
  },

  "sprite-splitter": {
    name: "sprite-splitter",
    title: "精灵图拆分",
    description:
      "拆分精灵图集。mode=transparent(默认)按透明区域自动识别独立精灵;mode=grid 按 columns×rows 均匀网格切分。返回多张 PNG。",
    params: {
      mode: z.enum(["transparent", "grid"]).optional().describe("拆分模式,默认 transparent"),
      columns: z.number().int().min(1).optional().describe("grid 模式:列数"),
      rows: z.number().int().min(1).optional().describe("grid 模式:行数"),
    },
    async run(input, params, baseName) {
      const mode = params.mode ?? "transparent";
      const meta = await sharp(input).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;

      let boxes;
      if (mode === "grid") {
        if (!params.columns || !params.rows) {
          throw new Error("grid 模式需要提供 columns 和 rows");
        }
        boxes = gridSpriteBoxes(width, height, params.columns, params.rows);
      } else {
        const img = await decodeRaw(input);
        boxes = findSpriteBoxes(img);
      }

      if (boxes.length === 0) {
        return [];
      }

      const results: ImageResult[] = [];
      let index = 1;
      for (const box of boxes) {
        const { data, info } = await sharp(input)
          .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
          .png()
          .toBuffer({ resolveWithObject: true });
        results.push({
          name: `${baseName}_${index}.png`,
          buffer: data,
          contentType: "image/png",
          ext: "png",
          width: info.width,
          height: info.height,
        });
        index++;
      }
      return results;
    },
  },

  vectorize: {
    name: "vectorize",
    title: "矢量化",
    description:
      "位图转 SVG(imagetracerjs)。preset 可选 default/curvy/sharp/detailed/smoothed/grayscale/posterized1-3 等;numberofcolors 控制颜色数。",
    params: {
      preset: z.string().optional().describe("预设风格,默认 default"),
      numberofcolors: z.number().int().min(2).max(64).optional().describe("颜色数量"),
      ltres: z.number().optional().describe("直线拟合阈值"),
      qtres: z.number().optional().describe("曲线拟合阈值"),
      scale: z.number().optional().describe("输出缩放,默认 1"),
      strokewidth: z.number().optional().describe("描边宽度"),
    },
    async run(input, params, baseName) {
      const img = await decodeRaw(input);

      const options: Record<string, unknown> = {};
      const preset = params.preset ?? "default";
      const presetObj = ImageTracer.optionpresets[preset];
      if (presetObj) Object.assign(options, presetObj);
      for (const key of ["numberofcolors", "ltres", "qtres", "scale", "strokewidth"]) {
        if (params[key] !== undefined) options[key] = params[key];
      }

      const svg = ImageTracer.imagedataToSVG(
        { width: img.width, height: img.height, data: img.data },
        options
      );
      return {
        name: `${baseName}.svg`,
        buffer: Buffer.from(svg, "utf-8"),
        contentType: "image/svg+xml",
        ext: "svg",
        width: img.width,
        height: img.height,
      };
    },
  },

  "atlas-packer": {
    name: "atlas-packer",
    title: "图集打包",
    description:
      "把多张图片打包成一张图集(PNG/WebP)+ TexturePacker JSON Hash 元数据。MaxRects 装箱;padding 控制精灵间距;extrude 把精灵边缘颜色外扩进留白(防止缩放/过滤出黑边);trim 可先裁掉每张图的透明边。",
    multiInput: true,
    params: {
      name: z.string().optional().describe("输出文件名(不含扩展名),默认 atlas"),
      padding: z.number().int().min(0).max(64).optional().describe("精灵间距 px,默认 2"),
      extrude: z.number().int().min(0).max(64).optional().describe("边缘外扩 px,默认与 padding 相同"),
      maxWidth: z.number().int().min(1).optional().describe("图集最大宽度,默认 2048"),
      maxHeight: z.number().int().min(1).optional().describe("图集最大高度,默认 2048"),
      powerOfTwo: z.boolean().optional().describe("图集尺寸补成 2 的幂,默认 false"),
      trim: z.boolean().optional().describe("打包前裁掉每张图的透明边,默认 false"),
      format: z.enum(["png", "webp"]).optional().describe("图集格式,默认 png"),
    },
    async runMulti(inputs, params) {
      if (inputs.length < 2) {
        throw new Error("atlas-packer 至少需要 2 张图片");
      }

      const padding = params.padding ?? 2;
      const extrude = params.extrude ?? padding;
      const maxWidth = params.maxWidth ?? 2048;
      const maxHeight = params.maxHeight ?? 2048;
      const format = params.format ?? "png";
      const outName = params.name ?? "atlas";
      const trimInput = params.trim ?? false;

      const taken = new Set<string>();
      const sprites: Array<{
        key: string;
        image: RawImage;
        offsetX: number;
        offsetY: number;
        sourceWidth: number;
        sourceHeight: number;
        trimmed: boolean;
      }> = [];

      for (const input of inputs) {
        const full = await decodeRaw(input.buffer);
        const box = trimInput ? contentBox(full) : null;
        // A fully transparent frame collapses to 1x1 instead of eating atlas
        // space; without trimming it keeps its original size.
        const image = box
          ? extractRaw(full, box.x, box.y, box.width, box.height)
          : trimInput
            ? createRaw(1, 1)
            : full;
        sprites.push({
          key: uniqueFrameKey(input.name, taken),
          image,
          offsetX: box?.x ?? 0,
          offsetY: box?.y ?? 0,
          sourceWidth: full.width,
          sourceHeight: full.height,
          trimmed: box
            ? box.width !== full.width || box.height !== full.height
            : false,
        });
      }

      const layout = packAtlas(
        sprites.map((sprite) => ({
          name: sprite.key,
          width: sprite.image.width,
          height: sprite.image.height,
        })),
        { padding, maxWidth, maxHeight }
      );

      let atlasWidth = layout.width;
      let atlasHeight = layout.height;
      if (params.powerOfTwo) {
        atlasWidth = nextPowerOfTwo(atlasWidth);
        atlasHeight = nextPowerOfTwo(atlasHeight);
        if (atlasWidth > maxWidth || atlasHeight > maxHeight) {
          throw new Error(
            `2 的幂图集为 ${atlasWidth}×${atlasHeight},超出 ${maxWidth}×${maxHeight} 上限`
          );
        }
      }

      const canvas = createRaw(atlasWidth, atlasHeight);
      const byKey = new Map(sprites.map((sprite) => [sprite.key, sprite]));
      for (const placement of layout.placements) {
        blit(byKey.get(placement.name)!.image, canvas, placement.x, placement.y);
      }
      if (extrude > 0) {
        bleedTransparent(canvas, extrude);
      }

      const ext = format === "webp" ? "webp" : "png";
      const imageName = `${outName}.${ext}`;
      const frames: Record<string, unknown> = {};
      for (const placement of layout.placements) {
        const sprite = byKey.get(placement.name)!;
        frames[placement.name] = {
          frame: {
            x: placement.x,
            y: placement.y,
            w: placement.width,
            h: placement.height,
          },
          rotated: false,
          trimmed: sprite.trimmed,
          spriteSourceSize: {
            x: sprite.offsetX,
            y: sprite.offsetY,
            w: sprite.image.width,
            h: sprite.image.height,
          },
          sourceSize: { w: sprite.sourceWidth, h: sprite.sourceHeight },
          pivot: { x: 0.5, y: 0.5 },
        };
      }

      const metadata = {
        frames,
        meta: {
          app: "image-master",
          version: "0.2.0",
          image: imageName,
          format: "RGBA8888",
          size: { w: atlasWidth, h: atlasHeight },
          scale: "1",
        },
      };

      return [
        {
          name: imageName,
          buffer:
            format === "webp"
              ? await encodeWebp(canvas)
              : await encodePng(canvas),
          contentType: format === "webp" ? "image/webp" : "image/png",
          ext,
          width: atlasWidth,
          height: atlasHeight,
        },
        {
          name: `${outName}.json`,
          buffer: Buffer.from(JSON.stringify(metadata, null, 2), "utf-8"),
          contentType: "application/json",
          ext: "json",
        },
      ];
    },
  },

  trim: {
    name: "trim",
    title: "透明边裁剪",
    description:
      "裁掉图片四周的透明边,可选保留透明留白、补成正方形、补成 2 的幂,并指定内容在画布中的对齐方式 — 引擎/图集导入前的尺寸归一化。",
    params: {
      threshold: z.number().int().min(0).max(254).optional().describe("判定为内容的 alpha 阈值,默认 0"),
      padding: z.number().int().min(0).max(1024).optional().describe("内容四周保留的透明留白 px,默认 0"),
      square: z.boolean().optional().describe("画布补成正方形,默认 false"),
      powerOfTwo: z.boolean().optional().describe("画布补成 2 的幂,默认 false"),
      anchor: z
        .enum(ANCHORS)
        .optional()
        .describe("内容在画布中的对齐方式,默认 center"),
    },
    async run(input, params, baseName) {
      const full = await decodeRaw(input);
      const box = contentBox(full, params.threshold ?? 0);
      if (!box) {
        throw new Error("图片完全透明,没有可裁剪的内容");
      }

      const content = extractRaw(full, box.x, box.y, box.width, box.height);
      const padding = params.padding ?? 0;
      let width = content.width + padding * 2;
      let height = content.height + padding * 2;
      if (params.square) {
        const side = Math.max(width, height);
        width = side;
        height = side;
      }
      if (params.powerOfTwo) {
        width = nextPowerOfTwo(width);
        height = nextPowerOfTwo(height);
      }

      const canvas = createRaw(width, height);
      const [dx, dy] = anchorOffset(
        params.anchor ?? "center",
        width,
        height,
        content.width,
        content.height
      );
      blit(content, canvas, dx, dy);

      return {
        name: `${baseName}_trim.png`,
        buffer: await encodePng(canvas),
        contentType: "image/png",
        ext: "png",
        width,
        height,
        originalWidth: full.width,
        originalHeight: full.height,
      };
    },
  },

  "alpha-bleed": {
    name: "alpha-bleed",
    title: "Alpha 边缘外扩",
    description:
      "把透明像素的 RGB 换成最近的可见像素颜色(边缘外扩),alpha 保持不变 — 消除缩放、mipmap 与图集采样时的黑边/灰边。unpremultiply 可还原黑底预乘的半透明边缘颜色。",
    params: {
      radius: z.number().int().min(1).max(64).optional().describe("外扩像素数,默认 4"),
      unpremultiply: z.boolean().optional().describe("按 c/a 还原半透明像素颜色,默认 false"),
    },
    async run(input, params, baseName) {
      const image = await decodeRaw(input);
      if (params.unpremultiply) {
        unpremultiplyAlpha(image);
      }
      bleedTransparent(image, params.radius ?? 4);
      return {
        name: `${baseName}_bleed.png`,
        buffer: await encodePng(image),
        contentType: "image/png",
        ext: "png",
        width: image.width,
        height: image.height,
      };
    },
  },

  "png-optimize": {
    name: "png-optimize",
    title: "PNG 无损优化/调色板量化",
    description:
      "面向游戏包体的 PNG 优化。mode=lossless 用最高 zlib 力度无损重压;mode=palette 把颜色量化到 2-256 色(像素风资源常用),体积可再降一大截。",
    params: {
      mode: z.enum(["lossless", "palette"]).optional().describe("优化模式,默认 lossless"),
      colors: z.number().int().min(2).max(256).optional().describe("palette 模式颜色数,默认 256"),
      dither: z.number().min(0).max(1).optional().describe("palette 模式抖动强度 0-1,默认 1"),
      effort: z.number().int().min(1).max(10).optional().describe("压缩力度 1-10,默认 7"),
      compressionLevel: z.number().int().min(0).max(9).optional().describe("zlib 级别 0-9,默认 9"),
    },
    async run(input, params, baseName) {
      const meta = await sharp(input).metadata();
      const effort = params.effort ?? 7;
      const compressionLevel = params.compressionLevel ?? 9;
      const pipe =
        (params.mode ?? "lossless") === "palette"
          ? sharp(input).png({
              palette: true,
              colours: params.colors ?? 256,
              dither: params.dither ?? 1,
              effort,
              compressionLevel,
            })
          : sharp(input).png({
              compressionLevel,
              effort,
              adaptiveFiltering: true,
            });

      const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
      return {
        name: `${baseName}_opt.png`,
        buffer: data,
        contentType: "image/png",
        ext: "png",
        width: info.width,
        height: info.height,
        originalWidth: meta.width,
        originalHeight: meta.height,
      };
    },
  },


  "sequence-to-sheet": {
    name: "sequence-to-sheet",
    title: "序列帧打包",
    description:
      "把一组序列帧排成等距网格的 spritesheet:每帧先取可见内容,再按 anchor 锚点对齐到统一单元格(角色动画用 bottom-center 可消除脚底漂移),输出 PNG/WebP + 含 grid/fps 的 JSON。",
    multiInput: true,
    params: {
      name: z.string().optional().describe("输出文件名(不含扩展名),默认 sheet"),
      columns: z.number().int().min(1).optional().describe("列数,默认按帧数取近似正方形"),
      padding: z.number().int().min(0).max(64).optional().describe("单元格间距 px,默认 0"),
      extrude: z.number().int().min(0).max(64).optional().describe("边缘外扩 px,默认与 padding 相同"),
      anchor: z.enum(ANCHORS).optional().describe("对齐锚点,默认 center;角色动画常用 bottom-center"),
      threshold: z.number().int().min(0).max(254).optional().describe("判定为内容的 alpha 阈值,默认 0"),
      fps: z.number().min(1).max(240).optional().describe("写入 JSON 的帧率,默认 12"),
      powerOfTwo: z.boolean().optional().describe("整张图补成 2 的幂,默认 false"),
      format: z.enum(["png", "webp"]).optional().describe("输出格式,默认 png"),
    },
    async runMulti(inputs, params) {
      if (inputs.length < 2) {
        throw new Error("sequence-to-sheet 至少需要 2 张序列帧");
      }

      const padding = params.padding ?? 0;
      const extrude = params.extrude ?? padding;
      const anchor = (params.anchor ?? "center") as Anchor;
      const threshold = params.threshold ?? 0;
      const format = params.format ?? "png";
      const outName = params.name ?? "sheet";

      const taken = new Set<string>();
      const frames: Array<{
        name: string;
        image: RawImage;
        sourceWidth: number;
        sourceHeight: number;
        box: { x: number; y: number; width: number; height: number };
      }> = [];

      for (const input of inputs) {
        const image = await decodeRaw(input.buffer);
        // A fully transparent frame still keeps its slot in the sequence.
        const box = contentBox(image, threshold) ?? {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        };
        frames.push({
          name: uniqueFrameKey(input.name, taken),
          image,
          sourceWidth: image.width,
          sourceHeight: image.height,
          box,
        });
      }

      const layout = planSequence(frames, {
        columns: params.columns,
        padding,
        anchor,
        powerOfTwo: params.powerOfTwo ?? false,
      });

      const canvas = createRaw(layout.width, layout.height);
      const byName = new Map(frames.map((frame) => [frame.name, frame]));
      for (const placement of layout.placements) {
        const frame = byName.get(placement.name)!;
        const content = extractRaw(
          frame.image,
          placement.box.x,
          placement.box.y,
          placement.box.width,
          placement.box.height
        );
        blit(content, canvas, placement.x, placement.y);
      }
      if (extrude > 0) {
        bleedTransparent(canvas, extrude);
      }

      const ext = format === "webp" ? "webp" : "png";
      const imageName = `${outName}.${ext}`;
      const step = (size: number) => size + padding;
      const metadata = {
        meta: {
          app: "image-master",
          version: "0.2.0",
          image: imageName,
          format: "RGBA8888",
          size: { w: layout.width, h: layout.height },
          grid: {
            columns: layout.columns,
            rows: layout.rows,
            cellWidth: layout.cellWidth,
            cellHeight: layout.cellHeight,
            padding,
          },
          fps: params.fps ?? 12,
          count: frames.length,
          anchor,
          scale: "1",
        },
        frames: layout.placements.map((placement, index) => ({
          index,
          name: placement.name,
          frame: {
            x: placement.column * step(layout.cellWidth),
            y: placement.row * step(layout.cellHeight),
            w: layout.cellWidth,
            h: layout.cellHeight,
          },
          content: {
            x: placement.x - placement.column * step(layout.cellWidth),
            y: placement.y - placement.row * step(layout.cellHeight),
            w: placement.box.width,
            h: placement.box.height,
          },
          trimmed:
            placement.box.width !== placement.sourceWidth ||
            placement.box.height !== placement.sourceHeight,
          spriteSourceSize: { ...placement.box },
          sourceSize: { w: placement.sourceWidth, h: placement.sourceHeight },
        })),
      };

      return [
        {
          name: imageName,
          buffer:
            format === "webp"
              ? await encodeWebp(canvas)
              : await encodePng(canvas),
          contentType: format === "webp" ? "image/webp" : "image/png",
          ext,
          width: layout.width,
          height: layout.height,
        },
        {
          name: `${outName}.json`,
          buffer: Buffer.from(JSON.stringify(metadata, null, 2), "utf-8"),
          contentType: "application/json",
          ext: "json",
        },
      ];
    },
  },

  "sheet-to-sequence": {
    name: "sheet-to-sequence",
    title: "序列帧导出",
    description:
      "把 spritesheet 按网格(padding 感知)切成单帧 PNG,帧名从 0001 开始补零,并输出含 grid/fps 的 JSON — sequence-to-sheet 的逆操作。cellWidth/cellHeight 用于补过 2 的幂的图集。",
    params: {
      name: z.string().optional().describe("输出帧名前缀,默认用输入文件名"),
      columns: z.number().int().min(1).optional().describe("列数"),
      rows: z.number().int().min(1).optional().describe("行数"),
      count: z.number().int().min(1).optional().describe("总帧数(不足整格时按此裁剪)"),
      cellWidth: z.number().int().min(1).optional().describe("单元格宽(覆盖自动计算)"),
      cellHeight: z.number().int().min(1).optional().describe("单元格高(覆盖自动计算)"),
      padding: z.number().int().min(0).max(64).optional().describe("单元格间距 px,默认 0"),
      trim: z.boolean().optional().describe("裁掉每帧的透明边,默认 false"),
      threshold: z.number().int().min(0).max(254).optional().describe("trim 时的 alpha 阈值,默认 0"),
      fps: z.number().min(1).max(240).optional().describe("写入 JSON 的帧率,默认 12"),
      format: z.enum(["png", "webp"]).optional().describe("输出格式,默认 png"),
    },
    async run(input, params, baseName) {
      const image = await decodeRaw(input);
      const padding = params.padding ?? 0;
      const format = params.format ?? "png";
      const ext = format === "webp" ? "webp" : "png";
      const prefix = params.name ?? baseName;

      const grid = resolveGrid({
        columns: params.columns,
        rows: params.rows,
        count: params.count,
        cellWidth: params.cellWidth,
        cellHeight: params.cellHeight,
        padding,
        sheetWidth: image.width,
        sheetHeight: image.height,
      });

      const step = (size: number) => size + padding;
      const results: ImageResult[] = [];
      const frames: unknown[] = [];

      for (let index = 0; index < grid.count; index++) {
        const column = index % grid.columns;
        const row = Math.floor(index / grid.columns);
        const x = column * step(grid.cellWidth);
        const y = row * step(grid.cellHeight);
        const cell = extractRaw(image, x, y, grid.cellWidth, grid.cellHeight);

        let frame = cell;
        let box = { x: 0, y: 0, width: grid.cellWidth, height: grid.cellHeight };
        if (params.trim) {
          const content = contentBox(cell, params.threshold ?? 0);
          box = content ?? { x: 0, y: 0, width: 1, height: 1 };
          frame = extractRaw(cell, box.x, box.y, box.width, box.height);
        }

        const frameName = `${prefix}_${String(index + 1).padStart(4, "0")}.${ext}`;
        results.push({
          name: frameName,
          buffer:
            format === "webp" ? await encodeWebp(frame) : await encodePng(frame),
          contentType: format === "webp" ? "image/webp" : "image/png",
          ext,
          width: frame.width,
          height: frame.height,
          originalWidth: grid.cellWidth,
          originalHeight: grid.cellHeight,
        });
        frames.push({
          index,
          name: frameName,
          column,
          row,
          cell: { x, y, w: grid.cellWidth, h: grid.cellHeight },
          trimmed: params.trim
            ? box.width !== grid.cellWidth || box.height !== grid.cellHeight
            : false,
          spriteSourceSize: { ...box },
          sourceSize: { w: grid.cellWidth, h: grid.cellHeight },
        });
      }

      const metadata = {
        meta: {
          app: "image-master",
          version: "0.2.0",
          source: baseName,
          size: { w: image.width, h: image.height },
          grid: {
            columns: grid.columns,
            rows: grid.rows,
            cellWidth: grid.cellWidth,
            cellHeight: grid.cellHeight,
            padding,
          },
          fps: params.fps ?? 12,
          count: grid.count,
          prefix,
          scale: "1",
        },
        frames,
      };

      results.push({
        name: `${prefix}.json`,
        buffer: Buffer.from(JSON.stringify(metadata, null, 2), "utf-8"),
        contentType: "application/json",
        ext: "json",
      });

      return results;
    },
  },

  "video-to-frames": {
    name: "video-to-frames",
    title: "视频转序列帧",
    description:
      "用 ffmpeg 把视频(mp4/webm/mov/gif 等)抽成序列帧图片。fps 省略时提取每一帧;start/end 按秒截取时间段;width/scale 等比缩小输出;webm(VP9) 等带透明通道的视频可产出带 alpha 的帧。输出帧图片 + 元数据 JSON。",
    params: {
      fps: z
        .number()
        .min(0.1)
        .max(120)
        .optional()
        .describe("提取帧率,每秒几帧;省略则提取每一帧"),
      start: z.number().min(0).optional().describe("开始时间(秒)"),
      end: z
        .number()
        .min(0)
        .optional()
        .describe("结束时间(秒);end-start 为截取时长"),
      width: z
        .number()
        .int()
        .min(8)
        .max(4096)
        .optional()
        .describe("输出宽度 px,等比缩放;与 scale 二选一"),
      scale: z
        .number()
        .min(0.01)
        .max(4)
        .optional()
        .describe("缩放系数;与 width 二选一"),
      format: z.enum(["png", "webp", "jpeg"]).optional().describe("输出格式,默认 png"),
      maxFrames: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe("最多提取帧数,默认 300"),
      name: z.string().optional().describe("输出帧名前缀,默认用视频文件名"),
    },
    async run(input, params, baseName) {
      return extractVideoFrames(input, params, baseName);
    },
  },

  "nine-slice": {
    name: "nine-slice",
    title: "九宫格切分",
    description:
      "识别或按指定边框切分九宫格(9-slice / nine-patch)资源:输出 borders、minimumSize 与九个区域坐标的 JSON 描述,并导出各区域切片 PNG(四角固定、四边一维拉伸、中心二维拉伸)。left/right/top/bottom 省略时以图片中心像素为内部色,沿中间行/列自动识别边框,装饰环与圆角会一并算进边框;中心是渐变或纹理时应显式指定。",
    params: {
      left: z.number().int().min(0).optional().describe("左边框 px,省略则自动识别"),
      right: z.number().int().min(0).optional().describe("右边框 px,省略则自动识别"),
      top: z.number().int().min(0).optional().describe("上边框 px,省略则自动识别"),
      bottom: z.number().int().min(0).optional().describe("下边框 px,省略则自动识别"),
      tolerance: z.number().min(0).max(100).optional().describe("自动识别容差 0-100,默认 8"),
      slices: z.boolean().optional().describe("是否导出切片 PNG,默认 true"),
    },
    async run(input, params, baseName) {
      const image = await decodeRaw(input);
      const { borders, detected } = resolveBorders(
        image,
        {
          left: params.left,
          right: params.right,
          top: params.top,
          bottom: params.bottom,
        },
        params.tolerance ?? 8
      );

      const regions = nineSliceRegions(image.width, image.height, borders);
      const results: ImageResult[] = [];
      const sliceNames: Record<string, string> = {};

      if (params.slices ?? true) {
        for (const box of regions) {
          // A zero-width border simply has no slice to write.
          if (box.width <= 0 || box.height <= 0) continue;
          const slice = extractRaw(image, box.x, box.y, box.width, box.height);
          const fileName = `${baseName}_${REGION_SUFFIXES[box.region]}.png`;
          sliceNames[box.region] = fileName;
          results.push({
            name: fileName,
            buffer: await encodePng(slice),
            contentType: "image/png",
            ext: "png",
            width: box.width,
            height: box.height,
            originalWidth: image.width,
            originalHeight: image.height,
          });
        }
      }

      const metadata = {
        meta: {
          app: "image-master",
          version: "0.2.0",
          source: baseName,
          size: { w: image.width, h: image.height },
          scale: "1",
        },
        borders,
        detected,
        minimumSize: {
          w: borders.left + borders.right,
          h: borders.top + borders.bottom,
        },
        regions: Object.fromEntries(
          regions.map((box) => [
            box.region,
            { x: box.x, y: box.y, w: box.width, h: box.height },
          ])
        ),
        slices: sliceNames,
      };

      const descriptor: ImageResult = {
        name: `${baseName}_9slice.json`,
        buffer: Buffer.from(JSON.stringify(metadata, null, 2), "utf-8"),
        contentType: "application/json",
        ext: "json",
      };

      // Analysing only (no slices) is a plain JSON response, not a file bundle.
      return results.length > 0 ? [...results, descriptor] : descriptor;
    },
  },

  "palette-swap": {
    name: "palette-swap",
    title: "调色板替换",
    description:
      "把图中指定颜色换成别的颜色(队伍色/换肤/季节变体)。map 给显式 from→to 映射;palette 给一组目标颜色,按 order 排序后与图中现有颜色一一对应替换。alpha 不变,tolerance 可容忍接近色。输出替换后的 PNG + 记录实际映射与命中像素数的 JSON。",
    params: {
      map: z
        .array(z.object({ from: z.string(), to: z.string() }))
        .optional()
        .describe('显式颜色映射,如 [{"from":"#ff0000","to":"#0000ff"}]'),
      palette: z
        .array(z.string())
        .optional()
        .describe("目标调色板,按 order 与源调色板顺序一一对应;与 map 二选一"),
      order: z
        .enum(["luminance", "frequency", "first"])
        .optional()
        .describe("palette 模式下源调色板的排序,默认 luminance(暗→亮)"),
      tolerance: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("匹配容差 0-100(每通道),默认 0 精确匹配"),
    },
    async run(input, params, baseName) {
      const map = (params.map ?? []) as Array<{ from: string; to: string }>;
      const palette: string[] | undefined = params.palette;
      if (map.length === 0 && !palette?.length) {
        throw new Error("需要提供 map 或 palette 之一");
      }
      if (map.length > 0 && palette?.length) {
        throw new Error("map 与 palette 只能给一个");
      }

      const image = await decodeRaw(input);
      const order = params.order ?? "luminance";
      let pairs: RgbPair[];

      if (palette?.length) {
        const source = orderPalette(histogram(image).entries, order);
        if (palette.length < source.length) {
          throw new Error(
            `源图有 ${source.length} 种颜色(${source.map((entry) => rgbToHex(entry.rgb)).join(" ")}),目标 palette 只有 ${palette.length} 种;请补齐目标颜色,或用 map 做部分替换`
          );
        }
        pairs = source.map((entry, index) => ({
          from: entry.rgb,
          to: parseHexColor(palette[index]),
        }));
      } else {
        pairs = map.map((pair) => ({
          from: parseHexColor(pair.from),
          to: parseHexColor(pair.to),
        }));
      }

      const tolerance = params.tolerance ?? 0;
      const { replacedPixels, matched } = applyPaletteMap(image, pairs, tolerance);

      const warnings: string[] = [];
      pairs.forEach((pair, index) => {
        if (matched[index] === 0) {
          warnings.push(
            `映射 ${rgbToHex(pair.from)} → ${rgbToHex(pair.to)} 没有匹配到任何像素`
          );
        }
      });
      if (replacedPixels === 0) {
        warnings.push("没有任何像素被替换,检查颜色值或调大 tolerance");
      }

      const metadata = {
        meta: {
          app: "image-master",
          version: "0.2.0",
          source: baseName,
          size: { w: image.width, h: image.height },
          scale: "1",
        },
        mode: palette?.length ? "palette" : "map",
        ...(palette?.length ? { order } : {}),
        tolerance,
        mapping: pairs.map((pair, index) => ({
          from: rgbToHex(pair.from),
          to: rgbToHex(pair.to),
          matched: matched[index],
        })),
        replacedPixels,
        warnings,
      };

      return [
        {
          name: `${baseName}_swapped.png`,
          buffer: await encodePng(image),
          contentType: "image/png",
          ext: "png",
          width: image.width,
          height: image.height,
          originalWidth: image.width,
          originalHeight: image.height,
        },
        {
          name: `${baseName}_swap.json`,
          buffer: Buffer.from(JSON.stringify(metadata, null, 2), "utf-8"),
          contentType: "application/json",
          ext: "json",
        },
      ];
    },
  },

  "palette-extract": {
    name: "palette-extract",
    title: "调色板提取",
    description:
      "统计图片实际使用的颜色(忽略全透明像素),输出带占比的调色板 JSON,并可选输出色板示意图。颜色数超过上限时:quantize=true 用 libimagequant 量化取色(推荐),false 则按出现频率取前 N 种。需要落盘量化后的图片请用 png-optimize mode=palette。",
    params: {
      colors: z
        .number()
        .int()
        .min(2)
        .max(256)
        .optional()
        .describe("调色板上限,默认统计全部不同颜色(最多 256 种)"),
      quantize: z
        .boolean()
        .optional()
        .describe("超过上限时用 libimagequant 量化取色,默认 true;false 则按频率取前 N 种"),
      swatch: z.boolean().optional().describe("是否输出色板示意图 PNG,默认 true"),
    },
    async run(input, params, baseName) {
      const image = await decodeRaw(input);
      const stats = histogram(image);
      const limit = params.colors ?? 256;

      let entries = stats.entries;
      let quantized = false;
      let truncated = false;
      if (entries.length > limit) {
        if (params.quantize ?? true) {
          entries = await quantizePalette(input, limit);
          quantized = true;
        } else {
          entries = orderPalette(entries, "frequency").slice(0, limit);
          truncated = true;
        }
      } else {
        entries = orderPalette(entries, "frequency");
      }

      const warnings: string[] = [];
      if (stats.overflow > 0) {
        warnings.push(
          `颜色过多,有 ${stats.overflow} 个像素的颜色未被单独统计(超过 65536 种)`
        );
      }
      if (truncated) {
        warnings.push(
          `按出现频率取前 ${limit} 种,其余颜色未列出(可用 quantize=true 量化取色)`
        );
      }

      const results: ImageResult[] = [];
      if (params.swatch ?? true) {
        const swatch = paletteSwatch(entries);
        results.push({
          name: `${baseName}_palette.png`,
          buffer: await encodePng(swatch),
          contentType: "image/png",
          ext: "png",
          width: swatch.width,
          height: swatch.height,
        });
      }

      const metadata = {
        meta: {
          app: "image-master",
          version: "0.2.0",
          source: baseName,
          size: { w: image.width, h: image.height },
          scale: "1",
        },
        palette: entries.map((entry) => ({
          hex: rgbToHex(entry.rgb),
          ...entry.rgb,
          count: entry.count,
          share: Number((entry.count / Math.max(1, stats.opaquePixels)).toFixed(4)),
        })),
        distinct: stats.entries.length,
        limit,
        quantized,
        truncated,
        opaquePixels: stats.opaquePixels,
        transparentPixels: stats.transparentPixels,
        warnings,
      };

      results.push({
        name: `${baseName}_palette.json`,
        buffer: Buffer.from(JSON.stringify(metadata, null, 2), "utf-8"),
        contentType: "application/json",
        ext: "json",
      });

      return results;
    },
  },

  "asset-lint": {
    name: "asset-lint",
    title: "资源规范检查",
    description:
      "批量体检游戏资源:2 的幂、整除对齐、最大边长、格式白名单、透明通道、单文件体积、命名正则、扩展名与实际格式是否相符,并检查全透明空图与内容重复的文件。返回 JSON 报告,含 ok / 汇总 / 每个文件的问题清单。",
    multiInput: true,
    minInputs: 1,
    params: {
      name: z.string().optional().describe("报告文件名(不含扩展名),默认 lint-report"),
      powerOfTwo: z.boolean().optional().describe("要求宽高都是 2 的幂,默认 false"),
      multipleOf: z.number().int().min(2).max(4096).optional().describe("要求宽高都被这个数整除(如 4)"),
      maxSize: z.number().int().min(1).optional().describe("最大边长上限 +px"),
      formats: z.array(z.string()).optional().describe('格式白名单,如 ["png","webp"]'),
      alpha: z
        .enum(["any", "required", "forbidden"])
        .optional()
        .describe("透明通道要求:any 不检查(默认)/ required 必须有 / forbidden 不能有"),
      maxKilobytes: z.number().min(0.1).optional().describe("单文件体积上限 KB"),
      namePattern: z.string().optional().describe("文件名需匹配的正则,如 ^[a-z0-9_]+\\.png$"),
      forbidEmpty: z.boolean().optional().describe("全透明空图按错误处理(默认只警告)"),
    },
    async runMulti(inputs, params) {
      const rules: LintRules = {
        powerOfTwo: params.powerOfTwo ?? false,
        multipleOf: params.multipleOf,
        maxSize: params.maxSize,
        formats: params.formats,
        alpha: params.alpha ?? "any",
        maxKilobytes: params.maxKilobytes,
        namePattern: params.namePattern,
        forbidEmpty: params.forbidEmpty ?? false,
      };
      const name = params.name ?? "lint-report";

      const files: LintFile[] = [];
      for (const input of inputs) {
        const meta = await sharp(input.buffer).metadata();
        const image = await decodeRaw(input.buffer);
        let empty = true;
        for (let i = 3; i < image.data.length; i += 4) {
          if (image.data[i] !== 0) {
            empty = false;
            break;
          }
        }
        files.push({
          name: input.name,
          width: meta.width ?? image.width,
          height: meta.height ?? image.height,
          format: normalizeFormat(meta.format ?? "unknown"),
          hasAlpha: meta.hasAlpha ?? false,
          bytes: input.buffer.byteLength,
          empty,
          hash: hashBuffer(input.buffer),
        });
      }

      const report = {
        meta: {
          app: "image-master",
          version: "0.2.0",
          scale: "1",
        },
        ...lintAssets(files, rules),
      };

      return {
        name: `${name}.json`,
        buffer: Buffer.from(JSON.stringify(report, null, 2), "utf-8"),
        contentType: "application/json",
        ext: "json",
      };
    },
  },
};

/** De-duplicate a file name so it can be used as an atlas frame key. */
function uniqueFrameKey(fileName: string, taken: Set<string>): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  let key = `${base}${ext}`;
  let n = 2;
  while (taken.has(key)) {
    key = `${base}_${n}${ext}`;
    n++;
  }
  taken.add(key);
  return key;
}

export function getTool(name: string): AnyToolDef | undefined {
  return tools[name];
}

export function listTools(): AnyToolDef[] {
  return Object.values(tools);
}

/** Validate params against the tool schema (applies zod coercion/stripping). */
export function parseToolParams(
  tool: AnyToolDef,
  params: unknown
): Record<string, unknown> {
  return z.object(tool.params).parse(params ?? {});
}

export async function runTool(
  name: string,
  input: Buffer | ToolInput[],
  params: unknown,
  baseName: string
): Promise<ImageResult | ImageResult[]> {
  const tool = getTool(name);
  if (!tool) {
    throw new Error(
      `Unknown tool: ${name}. Available: ${Object.keys(tools).join(", ")}`
    );
  }
  const parsed = parseToolParams(tool, params);
  if (isMultiTool(tool)) {
    if (!Array.isArray(input)) {
      throw new Error(`Tool ${name} needs several input images`);
    }
    return tool.runMulti(input, parsed, baseName);
  }
  if (Array.isArray(input)) {
    throw new Error(`Tool ${name} takes a single input image`);
  }
  return tool.run(input, parsed, baseName);
}
