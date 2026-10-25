/**
 * Declarative UI config for the generic API tool panel.
 * Option names mirror the zod fields in core/registry.ts character for character,
 * so the panel can post them straight into POST /api/tools/{apiTool}.
 */

export type ApiToolOptionKind =
  | "number"
  | "boolean"
  | "enum"
  | "text"
  | "list" // comma/newline separated strings -> string[]
  | "colorPairs"; // textarea lines "#from #to" -> { from: string; to: string }[]

export interface ApiToolOption {
  /** MUST exactly match the zod param name in core/registry.ts */
  name: string;
  label: string;
  kind: ApiToolOptionKind;
  /** number/boolean/enum default; omit => parameter is left out of the request */
  defaultValue?: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  /** enum choices */
  choices?: Array<{ value: string; label: string }>;
  placeholder?: string;
  help?: string;
}

export interface ApiToolConfig {
  /** key in app/types.ts TOOLS[], also used by <ApiToolPanel toolKey=... /> */
  key: string;
  /** tool name accepted by /api/tools/{tool} */
  apiTool: string;
  /** short Chinese title shown above the panel */
  title: string;
  /** one-sentence Chinese description */
  description: string;
  inputs: "single" | "multiple";
  /** required minimum file count when inputs === "multiple" (default 2) */
  minInputs?: number;
  /** max file count when inputs === "multiple" (default 1 for single) */
  maxInputs?: number;
  /** file input accept attribute; omit for image/* */
  accept?: string;
  note?: string;
  options: ApiToolOption[];
}

/** core/anchor.ts ANCHORS, with Chinese labels for the picker. */
const ANCHOR_CHOICES: Array<{ value: string; label: string }> = [
  { value: "center", label: "居中" },
  { value: "top-left", label: "左上" },
  { value: "top", label: "上" },
  { value: "top-right", label: "右上" },
  { value: "left", label: "左" },
  { value: "right", label: "右" },
  { value: "bottom-left", label: "左下" },
  { value: "bottom", label: "下" },
  { value: "bottom-right", label: "右下" },
];

/** png / webp, the only atlas/sequence output formats the tools accept. */
const IMAGE_FORMAT_CHOICES: Array<{ value: string; label: string }> = [
  { value: "png", label: "PNG" },
  { value: "webp", label: "WebP" },
];

/* ---------------------------------------------------------------------------
 * Multi-input tools
 * ------------------------------------------------------------------------- */

const ATLAS_PACKER: ApiToolConfig = {
  key: "atlas-packer",
  apiTool: "atlas-packer",
  title: "图集打包",
  description:
    "把多张图片打包成一张图集(PNG/WebP)并输出 TexturePacker JSON Hash 元数据。",
  inputs: "multiple",
  minInputs: 2,
  note: "输出图集 + JSON 元数据",
  options: [
    {
      name: "name",
      label: "输出文件名",
      kind: "text",
      defaultValue: "atlas",
      placeholder: "atlas",
      help: "输出文件名(不含扩展名),默认 atlas",
    },
    {
      name: "padding",
      label: "精灵间距",
      kind: "number",
      defaultValue: 2,
      min: 0,
      max: 64,
      help: "精灵间距 px,默认 2",
    },
    {
      name: "extrude",
      label: "边缘外扩",
      kind: "number",
      min: 0,
      max: 64,
      help: "边缘外扩 px,默认与 padding 相同",
    },
    {
      name: "maxWidth",
      label: "最大宽度",
      kind: "number",
      defaultValue: 2048,
      min: 1,
      help: "图集最大宽度,默认 2048",
    },
    {
      name: "maxHeight",
      label: "最大高度",
      kind: "number",
      defaultValue: 2048,
      min: 1,
      help: "图集最大高度,默认 2048",
    },
    {
      name: "powerOfTwo",
      label: "2 的幂尺寸",
      kind: "boolean",
      defaultValue: false,
      help: "图集尺寸补成 2 的幂,默认 false",
    },
    {
      name: "trim",
      label: "裁透明边",
      kind: "boolean",
      defaultValue: false,
      help: "打包前裁掉每张图的透明边,默认 false",
    },
    {
      name: "format",
      label: "图集格式",
      kind: "enum",
      defaultValue: "png",
      choices: IMAGE_FORMAT_CHOICES,
      help: "图集格式,默认 png",
    },
  ],
};

const SEQUENCE_TO_SHEET: ApiToolConfig = {
  key: "sequence-to-sheet",
  apiTool: "sequence-to-sheet",
  title: "序列帧打包",
  description:
    "把一组序列帧排成等距网格的 spritesheet,输出 PNG/WebP 与含 grid/fps 的 JSON。",
  inputs: "multiple",
  minInputs: 2,
  note: "输出 spritesheet + 含 grid/fps 的 JSON",
  options: [
    {
      name: "name",
      label: "输出文件名",
      kind: "text",
      defaultValue: "sheet",
      placeholder: "sheet",
      help: "输出文件名(不含扩展名),默认 sheet",
    },
    {
      name: "columns",
      label: "列数",
      kind: "number",
      min: 1,
      help: "列数,默认按帧数取近似正方形",
    },
    {
      name: "padding",
      label: "单元格间距",
      kind: "number",
      defaultValue: 0,
      min: 0,
      max: 64,
      help: "单元格间距 px,默认 0",
    },
    {
      name: "extrude",
      label: "边缘外扩",
      kind: "number",
      min: 0,
      max: 64,
      help: "边缘外扩 px,默认与 padding 相同",
    },
    {
      name: "anchor",
      label: "对齐锚点",
      kind: "enum",
      defaultValue: "center",
      choices: ANCHOR_CHOICES,
      help: "角色动画常用 bottom-center 消除脚底漂移",
    },
    {
      name: "threshold",
      label: "alpha 阈值",
      kind: "number",
      defaultValue: 0,
      min: 0,
      max: 254,
      help: "判定为内容的 alpha 阈值,默认 0",
    },
    {
      name: "fps",
      label: "帧率",
      kind: "number",
      defaultValue: 12,
      min: 1,
      max: 240,
      help: "写入 JSON 的帧率,默认 12",
    },
    {
      name: "powerOfTwo",
      label: "2 的幂尺寸",
      kind: "boolean",
      defaultValue: false,
      help: "整张图补成 2 的幂,默认 false",
    },
    {
      name: "format",
      label: "输出格式",
      kind: "enum",
      defaultValue: "png",
      choices: IMAGE_FORMAT_CHOICES,
      help: "输出格式,默认 png",
    },
  ],
};

const ASSET_LINT: ApiToolConfig = {
  key: "asset-lint",
  apiTool: "asset-lint",
  title: "资源规范检查",
  description:
    "批量体检游戏资源规范:2 的幂、整除对齐、最大边长、格式、透明通道、体积与命名正则。",
  inputs: "multiple",
  minInputs: 1,
  note: "报告里 ok=false 表示存在问题",
  options: [
    {
      name: "name",
      label: "报告文件名",
      kind: "text",
      defaultValue: "lint-report",
      placeholder: "lint-report",
      help: "报告文件名(不含扩展名),默认 lint-report",
    },
    {
      name: "powerOfTwo",
      label: "要求 2 的幂",
      kind: "boolean",
      defaultValue: false,
      help: "要求宽高都是 2 的幂,默认 false",
    },
    {
      name: "multipleOf",
      label: "整除对齐",
      kind: "number",
      min: 2,
      max: 4096,
      placeholder: "4",
      help: "要求宽高都被这个数整除(如 4)",
    },
    {
      name: "maxSize",
      label: "最大边长",
      kind: "number",
      min: 1,
      help: "最大边长上限 +px",
    },
    {
      name: "formats",
      label: "格式白名单",
      kind: "list",
      placeholder: "png, webp",
      help: "格式白名单,逗号或换行分隔,如 png,webp",
    },
    {
      name: "alpha",
      label: "透明通道要求",
      kind: "enum",
      defaultValue: "any",
      choices: [
        { value: "any", label: "不检查" },
        { value: "required", label: "必须有" },
        { value: "forbidden", label: "不能有" },
      ],
      help: "any 不检查(默认)/ required 必须有 / forbidden 不能有",
    },
    {
      name: "maxKilobytes",
      label: "体积上限",
      kind: "number",
      min: 0.1,
      step: 0.1,
      placeholder: "500",
      help: "单文件体积上限 KB",
    },
    {
      name: "namePattern",
      label: "命名正则",
      kind: "text",
      placeholder: "^[a-z0-9_]+$",
      help: "文件名需匹配的正则表达式",
    },
    {
      name: "forbidEmpty",
      label: "空图按错误处理",
      kind: "boolean",
      defaultValue: false,
      help: "全透明空图按错误处理(默认只警告)",
    },
  ],
};

/* ---------------------------------------------------------------------------
 * Single-input tools
 * ------------------------------------------------------------------------- */

const SHEET_TO_SEQUENCE: ApiToolConfig = {
  key: "sheet-to-sequence",
  apiTool: "sheet-to-sequence",
  title: "序列帧导出",
  description:
    "把 spritesheet 按网格切成单帧 PNG,并输出含 grid/fps 的 JSON。",
  inputs: "single",
  note: "帧名从 0001 开始补零",
  options: [
    {
      name: "name",
      label: "帧名前缀",
      kind: "text",
      placeholder: "输入文件名",
      help: "输出帧名前缀,默认用输入文件名",
    },
    { name: "columns", label: "列数", kind: "number", min: 1, help: "列数" },
    { name: "rows", label: "行数", kind: "number", min: 1, help: "行数" },
    {
      name: "count",
      label: "总帧数",
      kind: "number",
      min: 1,
      help: "总帧数(不足整格时按此裁剪)",
    },
    {
      name: "cellWidth",
      label: "单元格宽",
      kind: "number",
      min: 1,
      help: "单元格宽(覆盖自动计算)",
    },
    {
      name: "cellHeight",
      label: "单元格高",
      kind: "number",
      min: 1,
      help: "单元格高(覆盖自动计算)",
    },
    {
      name: "padding",
      label: "单元格间距",
      kind: "number",
      defaultValue: 0,
      min: 0,
      max: 64,
      help: "单元格间距 px,默认 0",
    },
    {
      name: "trim",
      label: "裁透明边",
      kind: "boolean",
      defaultValue: false,
      help: "裁掉每帧的透明边,默认 false",
    },
    {
      name: "threshold",
      label: "alpha 阈值",
      kind: "number",
      defaultValue: 0,
      min: 0,
      max: 254,
      help: "trim 时的 alpha 阈值,默认 0",
    },
    {
      name: "fps",
      label: "帧率",
      kind: "number",
      defaultValue: 12,
      min: 1,
      max: 240,
      help: "写入 JSON 的帧率,默认 12",
    },
    {
      name: "format",
      label: "输出格式",
      kind: "enum",
      defaultValue: "png",
      choices: IMAGE_FORMAT_CHOICES,
      help: "输出格式,默认 png",
    },
  ],
};

const NINE_SLICE: ApiToolConfig = {
  key: "nine-slice",
  apiTool: "nine-slice",
  title: "九宫格切分",
  description:
    "识别或按指定边框切分九宫格资源,输出边框 JSON 描述与各区域切片 PNG。",
  inputs: "single",
  note: "边框留空时沿中间行/列自动识别",
  options: [
    {
      name: "left",
      label: "左边框",
      kind: "number",
      min: 0,
      help: "左边框 px,省略则自动识别",
    },
    {
      name: "right",
      label: "右边框",
      kind: "number",
      min: 0,
      help: "右边框 px,省略则自动识别",
    },
    {
      name: "top",
      label: "上边框",
      kind: "number",
      min: 0,
      help: "上边框 px,省略则自动识别",
    },
    {
      name: "bottom",
      label: "下边框",
      kind: "number",
      min: 0,
      help: "下边框 px,省略则自动识别",
    },
    {
      name: "tolerance",
      label: "识别容差",
      kind: "number",
      defaultValue: 8,
      min: 0,
      max: 100,
      help: "自动识别容差 0-100,默认 8",
    },
    {
      name: "slices",
      label: "导出切片",
      kind: "boolean",
      defaultValue: true,
      help: "是否导出切片 PNG,默认 true",
    },
  ],
};

const PALETTE_SWAP: ApiToolConfig = {
  key: "palette-swap",
  apiTool: "palette-swap",
  title: "调色板替换",
  description:
    "把图中指定颜色换成别的颜色,输出替换后的 PNG 与记录实际映射的 JSON。",
  inputs: "single",
  note: "alpha 通道不会被修改",
  options: [
    {
      name: "map",
      label: "颜色映射",
      kind: "colorPairs",
      placeholder: "#ff0000 #0000ff",
      help: "每行一对 from to 颜色,与 palette 二选一",
    },
    {
      name: "palette",
      label: "目标调色板",
      kind: "list",
      placeholder: "#ffffff, #ff8800",
      help: "按 order 与源调色板一一对应,与 map 二选一",
    },
    {
      name: "order",
      label: "源调色板排序",
      kind: "enum",
      defaultValue: "luminance",
      choices: [
        { value: "luminance", label: "按亮度(暗→亮)" },
        { value: "frequency", label: "按出现频率" },
        { value: "first", label: "按首次出现" },
      ],
      help: "palette 模式下源调色板的排序,默认 luminance(暗→亮)",
    },
    {
      name: "tolerance",
      label: "匹配容差",
      kind: "number",
      defaultValue: 0,
      min: 0,
      max: 100,
      help: "匹配容差 0-100(每通道),默认 0 精确匹配",
    },
  ],
};

const PALETTE_EXTRACT: ApiToolConfig = {
  key: "palette-extract",
  apiTool: "palette-extract",
  title: "调色板提取",
  description:
    "统计图片实际使用的颜色(忽略全透明像素),输出带占比的调色板 JSON 与色板示意图。",
  inputs: "single",
  note: "要落盘量化后的图片请用 PNG 优化 mode=palette",
  options: [
    {
      name: "colors",
      label: "颜色数上限",
      kind: "number",
      defaultValue: 256,
      min: 2,
      max: 256,
      help: "调色板上限,默认统计全部不同颜色(最多 256 种)",
    },
    {
      name: "quantize",
      label: "量化取色",
      kind: "boolean",
      defaultValue: true,
      help: "超过上限时用 libimagequant 量化取色,默认 true",
    },
    {
      name: "swatch",
      label: "输出色板图",
      kind: "boolean",
      defaultValue: true,
      help: "是否输出色板示意图 PNG,默认 true",
    },
  ],
};

const TRIM: ApiToolConfig = {
  key: "trim",
  apiTool: "trim",
  title: "透明边裁剪",
  description:
    "裁掉图片四周的透明边,可保留透明留白、补成正方形或 2 的幂,并指定内容对齐方式。",
  inputs: "single",
  note: "图片完全透明时会报错,没有可裁剪的内容",
  options: [
    {
      name: "threshold",
      label: "alpha 阈值",
      kind: "number",
      defaultValue: 0,
      min: 0,
      max: 254,
      help: "判定为内容的 alpha 阈值,默认 0",
    },
    {
      name: "padding",
      label: "保留留白",
      kind: "number",
      defaultValue: 0,
      min: 0,
      max: 1024,
      help: "内容四周保留的透明留白 px,默认 0",
    },
    {
      name: "square",
      label: "补成正方形",
      kind: "boolean",
      defaultValue: false,
      help: "画布补成正方形,默认 false",
    },
    {
      name: "powerOfTwo",
      label: "补成 2 的幂",
      kind: "boolean",
      defaultValue: false,
      help: "画布补成 2 的幂,默认 false",
    },
    {
      name: "anchor",
      label: "内容对齐",
      kind: "enum",
      defaultValue: "center",
      choices: ANCHOR_CHOICES,
      help: "内容在画布中的对齐方式,默认 center",
    },
  ],
};

const ALPHA_BLEED: ApiToolConfig = {
  key: "alpha-bleed",
  apiTool: "alpha-bleed",
  title: "Alpha 边缘外扩",
  description:
    "把透明像素的 RGB 换成最近的可见像素颜色,消除缩放、mipmap 与图集采样时的黑边。",
  inputs: "single",
  note: "alpha 值保持不变,只改透明像素的颜色",
  options: [
    {
      name: "radius",
      label: "外扩像素",
      kind: "number",
      defaultValue: 4,
      min: 1,
      max: 64,
      help: "外扩像素数,默认 4",
    },
    {
      name: "unpremultiply",
      label: "还原预乘颜色",
      kind: "boolean",
      defaultValue: false,
      help: "按 c/a 还原半透明像素颜色,默认 false",
    },
  ],
};

const PNG_OPTIMIZE: ApiToolConfig = {
  key: "png-optimize",
  apiTool: "png-optimize",
  title: "PNG 优化",
  description:
    "面向游戏包体的 PNG 优化:lossless 用最高 zlib 力度无损重压,palette 把颜色量化到 2-256 色。",
  inputs: "single",
  note: "colors / dither 只在 palette 模式下生效",
  options: [
    {
      name: "mode",
      label: "优化模式",
      kind: "enum",
      defaultValue: "lossless",
      choices: [
        { value: "lossless", label: "无损重压" },
        { value: "palette", label: "调色板量化" },
      ],
      help: "优化模式,默认 lossless",
    },
    {
      name: "colors",
      label: "颜色数",
      kind: "number",
      defaultValue: 256,
      min: 2,
      max: 256,
      help: "palette 模式颜色数,默认 256",
    },
    {
      name: "dither",
      label: "抖动强度",
      kind: "number",
      defaultValue: 1,
      min: 0,
      max: 1,
      step: 0.1,
      help: "palette 模式抖动强度 0-1,默认 1",
    },
    {
      name: "effort",
      label: "压缩力度",
      kind: "number",
      defaultValue: 7,
      min: 1,
      max: 10,
      help: "压缩力度 1-10,默认 7",
    },
    {
      name: "compressionLevel",
      label: "zlib 级别",
      kind: "number",
      defaultValue: 9,
      min: 0,
      max: 9,
      help: "zlib 级别 0-9,默认 9",
    },
  ],
};

const VIDEO_TO_FRAMES: ApiToolConfig = {
  key: "video-to-frames",
  apiTool: "video-to-frames",
  title: "视频转序列帧",
  description:
    "把视频(mp4/webm/mov/gif 等)按帧率抽成 PNG/WebP/JPEG 序列帧,可截取时间段、等比缩放;带透明通道的 webm 可导出透明帧。",
  inputs: "single",
  accept: "video/*,image/gif,.mkv,.mov,.webm,.avi,.m4v",
  note: "建议视频不超过 200MB;超过「最多帧数」的帧会被截断,处理由本机服务完成",
  options: [
    {
      name: "fps",
      label: "提取帧率 (fps)",
      kind: "number",
      min: 0.1,
      max: 120,
      step: 0.1,
      placeholder: "留白 = 每一帧",
      help: "每秒提取几帧;不填则提取视频里的每一帧",
    },
    {
      name: "start",
      label: "开始时间 (秒)",
      kind: "number",
      min: 0,
      step: 0.1,
      placeholder: "0",
    },
    {
      name: "end",
      label: "结束时间 (秒)",
      kind: "number",
      min: 0,
      step: 0.1,
      placeholder: "视频结尾",
      help: "与开始时间一起截取时间段",
    },
    {
      name: "width",
      label: "输出宽度 (px)",
      kind: "number",
      min: 8,
      max: 4096,
      placeholder: "原尺寸",
      help: "等比缩放,游戏素材常用 256~512;与缩放系数二选一",
    },
    {
      name: "scale",
      label: "缩放系数",
      kind: "number",
      min: 0.01,
      max: 4,
      step: 0.05,
      placeholder: "1",
      help: "如 0.5 = 尺寸减半;与输出宽度二选一",
    },
    {
      name: "format",
      label: "输出格式",
      kind: "enum",
      defaultValue: "png",
      choices: [
        { value: "png", label: "PNG (支持透明)" },
        { value: "webp", label: "WebP (体积小,支持透明)" },
        { value: "jpeg", label: "JPEG (无透明)" },
      ],
    },
    {
      name: "maxFrames",
      label: "最多帧数",
      kind: "number",
      min: 1,
      max: 2000,
      defaultValue: 300,
      help: "安全上限,防止长视频占用过多内存",
    },
    {
      name: "name",
      label: "输出帧名前缀",
      kind: "text",
      placeholder: "默认用视频文件名",
    },
  ],
};

export const API_TOOLS: ApiToolConfig[] = [
  ATLAS_PACKER,
  SEQUENCE_TO_SHEET,
  ASSET_LINT,
  SHEET_TO_SEQUENCE,
  NINE_SLICE,
  PALETTE_SWAP,
  PALETTE_EXTRACT,
  TRIM,
  ALPHA_BLEED,
  PNG_OPTIMIZE,
  VIDEO_TO_FRAMES,
];

/** Look up a tool config; returns undefined for unknown keys. */
export function getApiTool(key: string): ApiToolConfig | undefined {
  return API_TOOLS.find((tool) => tool.key === key);
}