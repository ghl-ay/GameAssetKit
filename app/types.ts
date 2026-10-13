export interface TransferData {
  files: File[];
  fromModule: string;
}

export interface ToolConfig {
  key: string;
  path: string;
  name: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  icon: string;
  /** 处理由自托管服务端完成(而不是浏览器端),用于在列表里标注 */
  serverSide?: boolean;
}

export const SITE_URL = "https://image.moonrailgun.com";
export const SITE_NAME = "Image Master";

export const TOOLS: ToolConfig[] = [
  {
    key: "background",
    path: "/background-remover",
    name: "背景扣除",
    description:
      "上传带纯色背景的图片，自动将背景色处理为透明。支持自动检测、手动拾取颜色、调整容差范围。",
    seoTitle: "在线图片背景扣除 - 自动去背景透明化工具",
    seoDescription:
      "免费在线图片背景扣除工具，支持自动检测背景色、手动取色、AI智能抠图。纯前端处理，无需上传服务器，保护隐私安全。",
    icon: "eye",
  },
  {
    key: "sprite",
    path: "/sprite-splitter",
    name: "精灵图拆分",
    description:
      "上传带透明通道的 PNG 图片（如游戏 UI 精灵图集），自动按照透明区域间隙识别并拆分成独立的小图片。",
    seoTitle: "精灵图拆分工具 - Sprite Sheet自动切图",
    seoDescription:
      "免费在线精灵图拆分工具，自动识别透明区域间隙并拆分sprite sheet为独立图片。支持游戏UI精灵图集、CSS雪碧图切割，纯前端处理。",
    icon: "grid",
  },
  {
    key: "upscale",
    path: "/upscale",
    name: "超分放大",
    description:
      "使用 Real-ESRGAN 深度学习模型，将图片放大 4x，同时增强细节和清晰度。首次使用需下载模型。",
    seoTitle: "AI图片超分放大 - Real-ESRGAN 4倍无损放大",
    seoDescription:
      "使用Real-ESRGAN深度学习模型在线放大图片4倍，AI智能增强细节和清晰度。纯前端处理，无需上传服务器，免费使用。",
    icon: "expand",
  },
  {
    key: "resize",
    path: "/resize",
    name: "尺寸调整",
    description:
      "批量调整图片尺寸，支持按比例缩放或指定目标尺寸，可锁定宽高比保持图片不变形。",
    seoTitle: "在线图片尺寸调整 - 批量缩放修改分辨率",
    seoDescription:
      "免费在线图片尺寸调整工具，支持批量缩放、指定目标尺寸、锁定宽高比。纯前端处理，快速修改图片分辨率大小。",
    icon: "resize",
  },
  {
    key: "compress",
    path: "/compress",
    name: "图片压缩",
    description:
      "智能压缩图片文件大小，支持 JPEG、WebP、PNG 格式转换和质量调节，在保持画质的同时大幅减小文件体积。",
    seoTitle: "在线图片压缩 - 智能无损压缩减小文件大小",
    seoDescription:
      "免费在线图片压缩工具，支持JPEG、WebP、PNG格式转换和质量调节。智能压缩保持画质，大幅减小文件体积，纯前端处理。",
    icon: "compress",
  },
  {
    key: "transform",
    path: "/transform",
    name: "旋转翻转",
    description:
      "对图片进行旋转和翻转操作，支持顺时针/逆时针旋转 90°、180°，以及水平/垂直翻转。可组合多个操作按顺序应用。",
    seoTitle: "在线图片旋转翻转 - 批量旋转镜像翻转工具",
    seoDescription:
      "免费在线图片旋转翻转工具，支持90°/180°旋转、水平垂直翻转、组合变换。批量处理多张图片，纯前端处理无需上传。",
    icon: "transform",
  },
  {
    key: "inpaint",
    path: "/inpaint",
    name: "图片修复",
    description:
      "使用 AI 自动修复图片中涂抹标记的区域，可用于移除水印、修复划痕、消除不需要的物体等。首次使用需下载模型。",
    seoTitle: "AI图片修复 - 在线去水印修复划痕消除物体",
    seoDescription:
      "免费AI图片修复工具，智能移除水印、修复划痕、消除不需要的物体。使用深度学习模型，纯前端处理，保护隐私。",
    icon: "edit",
  },
  {
    key: "crop",
    path: "/crop",
    name: "图片裁剪",
    description:
      "自由裁剪图片区域，支持拖拽调整裁剪框大小和位置，也可精确输入像素值进行精准裁剪。",
    seoTitle: "在线图片裁剪 - 自由裁剪精确像素裁切",
    seoDescription:
      "免费在线图片裁剪工具，支持自由拖拽裁剪框、精确输入像素值裁切。快速裁剪图片区域，纯前端处理无需上传。",
    icon: "crop",
  },
  {
    key: "vectorize",
    path: "/vectorize",
    name: "图片矢量化",
    description:
      "将 PNG/JPG 位图转换为 SVG 矢量图，支持多种预设风格和自定义参数调节，可控制颜色数量、曲线精度等。",
    seoTitle: "图片矢量化 - PNG/JPG转SVG矢量图工具",
    seoDescription:
      "免费在线图片矢量化工具，将PNG/JPG位图转换为SVG矢量图。支持多种预设风格、自定义参数调节，纯前端处理。",
    icon: "vectorize",
  },
  {
    key: "atlas-packer",
    path: "/atlas-packer",
    name: "图集打包",
    description:
      "把多张图片打包成一张图集（PNG/WebP）并输出 TexturePacker 元数据，支持自动裁掉透明边、精灵间距、边缘外扩与 2 的幂尺寸。",
    seoTitle: "图集打包 - 多图合成 Sprite Atlas 并导出元数据",
    seoDescription:
      "在线图集打包工具，把多张精灵图合成一张图集并导出 TexturePacker JSON 元数据。支持透明边裁剪、精灵间距、边缘外扩、2 的幂尺寸与最大边长限制。",
    icon: "atlas",
    serverSide: true,
  },
  {
    key: "sequence-to-sheet",
    path: "/sequence-to-sheet",
    name: "序列帧打包",
    description:
      "把一组序列帧排成等距网格的 spritesheet，按锚点对齐消除抖动，输出图集与帧率元数据。",
    seoTitle: "序列帧打包 - 动画帧合成 Spritesheet 并按锚点对齐",
    seoDescription:
      "在线序列帧打包工具，把动画帧合成等距网格 spritesheet。按锚点（如脚底）对齐消除抖动，输出网格与帧率元数据，支持间距与边缘外扩。",
    icon: "frames",
    serverSide: true,
  },
  {
    key: "sheet-to-sequence",
    path: "/sheet-to-sequence",
    name: "序列帧导出",
    description:
      "把 spritesheet 按网格切成独立帧图片（可裁掉每帧透明边），并输出帧率与网格信息。",
    seoTitle: "序列帧导出 - Spritesheet 按网格切分成独立帧图片",
    seoDescription:
      "在线序列帧导出工具，按网格把 spritesheet 切成独立帧 PNG，支持单元格间距识别、逐帧透明边裁剪，并输出帧率与网格元数据。",
    icon: "split",
    serverSide: true,
  },
  {
    key: "nine-slice",
    path: "/nine-slice",
    name: "九宫格切分",
    description:
      "识别或指定九宫格边框，输出九宫格参数 JSON 与各区域切片，供 UI 九宫格拉伸使用。",
    seoTitle: "九宫格切分 - 9-slice 边框识别与切片导出",
    seoDescription:
      "在线九宫格（9-slice / nine-patch）工具，自动识别或指定边框，输出 borders、最小尺寸与九个区域坐标的 JSON，并导出各区域切片，可处理装饰环与圆角。",
    icon: "nine",
    serverSide: true,
  },
  {
    key: "palette-swap",
    path: "/palette-swap",
    name: "调色板替换",
    description:
      "按颜色映射或整套调色板替换图片颜色，一键生成队伍色/换肤变体，并报告每个映射的命中像素数。",
    seoTitle: "调色板替换 - 像素图换肤与队伍配色批量变体",
    seoDescription:
      "在线调色板替换工具，按 from→to 映射或整套调色板批量替换图片颜色，用于像素图换肤、队伍配色变体。保持 alpha 通道不变并报告命中像素数。",
    icon: "palette",
    serverSide: true,
  },
  {
    key: "palette-extract",
    path: "/palette-extract",
    name: "调色板提取",
    description:
      "统计图片实际使用的颜色及占比，输出调色板 JSON 与色板示意图，颜色过多时可量化取色。",
    seoTitle: "调色板提取 - 统计图片颜色与色板导出",
    seoDescription:
      "在线调色板提取工具，统计图片实际使用的颜色与占比，输出调色板 JSON 和色板示意图。颜色过多时可用量化取色，忽略全透明像素。",
    icon: "swatch",
    serverSide: true,
  },
  {
    key: "asset-lint",
    path: "/asset-lint",
    name: "资源体检",
    description:
      "批量检查资源规范：2 的幂、整除对齐、最大边长、格式白名单、透明通道、文件体积与命名，并找出扩展名不符、空图和重复文件。",
    seoTitle: "资源体检 - 批量检查图片规范命名与体积",
    seoDescription:
      "在线图片资源体检工具，批量检查 2 的幂、整除对齐、最大边长、格式白名单、透明通道、文件体积与命名规范，并找出扩展名不符、全透明空图与内容重复的文件。",
    icon: "lint",
    serverSide: true,
  },
  {
    key: "trim",
    path: "/trim",
    name: "透明边裁剪",
    description:
      "裁掉图片四周的透明边，可保留留白、补正方形或 2 的幂，并指定内容对齐位置。",
    seoTitle: "透明边裁剪 - 批量裁掉 PNG 透明边界并归一化",
    seoDescription:
      "在线透明边裁剪工具，批量裁掉 PNG 四周透明区域，支持保留留白、补正方形、补成 2 的幂并按指定锚点对齐内容。",
    icon: "trim",
    serverSide: true,
  },
  {
    key: "alpha-bleed",
    path: "/alpha-bleed",
    name: "边缘外扩",
    description:
      "把透明像素的 RGB 用最近的可见颜色填充，消除缩放与图集采样时的黑边。",
    seoTitle: "边缘外扩 - 消除 PNG 缩放黑边的 Alpha 外扩",
    seoDescription:
      "在线 Alpha 边缘外扩工具，把透明像素颜色外扩到边缘，消除缩放、mipmap 与图集采样产生的黑边，alpha 通道保持不变。",
    icon: "bleed",
    serverSide: true,
  },
  {
    key: "png-optimize",
    path: "/png-optimize",
    name: "PNG 优化",
    description:
      "面向包体的 PNG 优化：无损重压或量化到 2-256 色（像素风资源体积可大幅下降）。",
    seoTitle: "PNG 优化 - 无损重压与调色板量化减小体积",
    seoDescription:
      "在线 PNG 优化工具，无损重压或量化到 2-256 色，用于游戏包体瘦身；量化模式对像素风资源体积下降明显。",
    icon: "optimize",
    serverSide: true,
  },
];
