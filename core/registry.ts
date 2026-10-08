import { z } from "zod";
import sharp from "sharp";
import ImageTracer from "imagetracerjs";
import type { ImageResult } from "./types";
import { decodeRaw, encodePng, parseHexColor } from "./image-io";
import { removeColorBackground } from "./pixel-color-key";
import { findSpriteBoxes, gridSpriteBoxes } from "./sprite-split";

export interface ToolParamSchema {
  [key: string]: z.ZodTypeAny;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  /** Zod raw shape of the params (input image is passed separately) */
  params: ToolParamSchema;
  /**
   * Process one image. `baseName` is the input file name without extension,
   * used to build result names.
   */
  run(
    input: Buffer,
    params: Record<string, any>,
    baseName: string
  ): Promise<ImageResult | ImageResult[]>;
}

const fitEnum = z.enum(["cover", "contain", "fill", "inside", "outside"]);

export const tools: Record<string, ToolDef> = {
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
};

export function getTool(name: string): ToolDef | undefined {
  return tools[name];
}

export function listTools(): ToolDef[] {
  return Object.values(tools);
}

/** Validate params against the tool schema (applies zod coercion/stripping). */
export function parseToolParams(
  tool: ToolDef,
  params: unknown
): Record<string, unknown> {
  return z.object(tool.params).parse(params ?? {});
}

export async function runTool(
  name: string,
  input: Buffer,
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
  return tool.run(input, parsed, baseName);
}
