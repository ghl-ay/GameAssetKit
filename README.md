# Image Master

一个图片处理工具：原有 9 个工具全部在浏览器本地完成，**不会上传到服务器**；新增的 11 个游戏资源流水线工具由自托管服务端（`sharp`）处理——图片只经过你自己运行的 app 服务器进程，不会上传到第三方。

## ✨ 功能特性

### 🎨 精灵图拆分 (Sprite Splitter)

- 上传带透明通道的 PNG 图片（如游戏 UI 精灵图集）
- 自动按照透明区域间隙识别并拆分成独立的小图片
- 支持批量处理多张图片
- 支持单张下载或 ZIP 打包下载

### 🖼️ 背景扣除 (Background Remover)

- 上传带纯色背景的图片，自动将背景色处理为透明
- 支持自动检测背景色或手动拾取颜色
- 可调整颜色容差范围
- 边缘羽化功能，减少锯齿感
- 仅处理连续像素选项，精确控制扣除区域
- AI 智能模式：ISNet 深度学习模型自动识别主体，默认请求 WebGPU 加速（不可用时自动回退 CPU），可选标准 / 高性能 / 轻量（默认，42MB）三档模型
- 通道抠图模式：按颜色通道阈值提取内容，适合绿幕/蓝幕、白纸黑字等前后景在某一通道差异明显的场景

### 🔍 AI 超分放大 (Super Resolution)

- 使用 Real-ESRGAN 深度学习模型进行超分辨率放大
- 支持 4x 放大倍率，同时增强细节和清晰度
- 首次使用需下载模型（约 64MB），支持本地缓存
- 使用 Web Worker 多线程处理，不阻塞 UI

### 📐 尺寸调整 (Image Resizer)

- 批量调整图片尺寸
- 支持按比例缩放（10% - 500%）或指定目标尺寸
- 可锁定宽高比保持图片不变形
- 实时预览输出尺寸

### 📦 图片压缩 (Image Compressor)

- 智能压缩图片文件大小
- 支持 JPEG、WebP、PNG 格式转换
- 可调整压缩质量（1% - 100%）
- 实时显示压缩率和节省空间

### 🔄 旋转翻转 (Image Transform)

- 快捷旋转：顺时针/逆时针 90°、180°
- 自定义角度旋转（正数顺时针，负数逆时针）
- 水平翻转、垂直翻转
- 支持连续处理：将结果作为新输入继续变换

### 🩹 AI 图片修复 (Image Inpainting)

- 使用 AI 自动修复图片中涂抹标记的区域
- 可用于移除水印、修复划痕、消除不需要的物体
- 画笔工具涂抹需要修复的区域
- 支持全屏编辑模式，方便精细操作
- 支持撤销操作
- 首次使用需下载模型

### 🎮 游戏资源流水线

后 11 个工具是给游戏资源批处理准备的,和已有的 `sprite-splitter`(拆图)组成完整闭环:

| 工具 | 作用 |
|---|---|
| `atlas-packer` | **多图**打包成一张图集(PNG/WebP)+ TexturePacker JSON Hash 元数据。MaxRects 装箱、`padding` 间距、`extrude` 把精灵边缘颜色外扩进留白、`trim` 先裁掉透明边、`powerOfTwo` 补成 2 的幂、`maxWidth`/`maxHeight` 限制尺寸 |
| `trim` | 裁掉四周透明边,可加透明留白(`padding`)、补正方形(`square`)、补 2 的幂(`powerOfTwo`),`anchor` 指定内容落在画布的哪个位置 |
| `alpha-bleed` | 把透明像素的 RGB 换成最近的可见像素颜色(边缘外扩),`alpha` 不变 —— 消除缩放、mipmap、图集采样时的黑边/灰边;`unpremultiply` 还原黑底预乘的半透明边缘 |
| `video-to-frames` | 用内置 ffmpeg 把视频(mp4/webm/mov/gif 等)抽成序列帧:`fps` 省略时逐帧提取,`start`/`end` 按秒截取,`width`/`scale` 等比缩放,`format` 可选 png/webp/jpeg,`maxFrames` 限制帧数(默认 300);带透明通道的 WebM(VP9)可产出带 alpha 的帧。输出帧图片 + 元数据 JSON |
| `sequence-to-sheet` | **多图**把序列帧排成等距网格的 spritesheet:每帧先取可见内容,再按 `anchor` 对齐到统一单元格(角色动画用 `bottom`/`bottom-center` 消除脚底漂移),`columns`/`padding`/`extrude`/`fps`/`powerOfTwo` |
| `sheet-to-sequence` | 反方向:按网格(`padding` 感知)把 spritesheet 切成从 `0001` 开始补零的单帧 PNG,可 `trim` 每帧透明边;`cellWidth`/`cellHeight` 用于补过 2 的幂的图集 |
| `nine-slice` | 九宫格(9-slice / nine-patch)UI 资源:输出 `borders`、`minimumSize` 与九个区域坐标的 JSON,并导出各区域切片 PNG(`slices=false` 时只输出 JSON 描述,适合批量分析)。边框可显式指定,也可自动识别(以中心像素为内部色,沿中间行/列扩展,装饰环与圆角都会算进边框) |
| `palette-extract` | 统计图片实际使用的颜色(忽略全透明像素),输出带占比的调色板 JSON + 色板示意图;超过上限时 `quantize=true` 用 libimagequant 量化取色(默认),`false` 则按频率取前 N 种 |
| `palette-swap` | 换肤/队伍色:按 `map` 显式 from→to 替换,或给 `palette` 由 `order`(luminance/frequency/first)排序后整份替换;`tolerance` 容忍接近色,输出替换后的 PNG + 记录命中数的 JSON |
| `asset-lint` | 批量体检:**多图**检查 2 的幂(`powerOfTwo`)、整除对齐(`multipleOf`)、最大边长(`maxSize`)、格式白名单(`formats`)、透明通道(`alpha`)、单文件体积(`maxKilobytes`)、文件名正则(`namePattern`),并顺带查出扩展名与实际格式不符、全透明空图、内容重复的文件。返回带 `ok` / 汇总 / 每个文件问题清单的 JSON 报告 |
| `png-optimize` | `mode=lossless` 用最高 zlib 力度无损重压;`mode=palette` 量化到 2-256 色(像素风资源常用) |

典型链路:`sprite-splitter` / `sheet-to-sequence` → `trim` → `alpha-bleed` → `sequence-to-sheet`(序列帧)或 `atlas-packer`(静态图集) → `png-optimize` → `asset-lint`(提交前体检);视频素材走 `video-to-frames` →(可选 AI 抠图)→ `sequence-to-sheet` / `atlas-packer`;UI 面板走 `nine-slice` 拿到九宫格参数;换肤变体走 `palette-extract`(取色)→ `palette-swap`(批量替换)。

```bash
bun cli.ts atlas-packer hero.png foe.png coin.png name=ui padding=4 trim=true powerOfTwo=true
bun cli.ts trim hero.png padding=6 powerOfTwo=true anchor=bottom-right
bun cli.ts alpha-bleed hero.png radius=6
bun cli.ts png-optimize hero.png mode=palette colors=16
bun cli.ts sequence-to-sheet walk_*.png name=walk columns=3 anchor=bottom fps=12
bun cli.ts sheet-to-sequence walk.png columns=3 count=6 trim=true --out ./frames
bun cli.ts video-to-frames walk.mp4 fps=12 width=512 --out ./frames
bun cli.ts nine-slice panel.png                      # 自动识别边框,导出 9 张切片 + JSON
bun cli.ts nine-slice panel.png left=8 right=8 top=6 bottom=6
bun cli.ts palette-extract orb.png                 # 调色板 JSON + 色板图
bun cli.ts palette-swap orb.png 'palette=["#101a2b","#2f5a9a","#4d8fd6","#d9ecff"]' order=luminance
bun cli.ts palette-swap orb.png 'map=[{"from":"#d1567a","to":"#3fae6a"}]'
bun cli.ts asset-lint --dir ./assets powerOfTwo=true maxSize=2048
```

### 🔗 工具联动

- 所有工具之间可以互相传递图片，方便进行连续处理流程
- 处理结果可一键发送到其他工具继续处理
- 支持拖拽上传和剪贴板粘贴上传

## 🛠️ 技术栈

- [Next.js 16](https://nextjs.org) - React 全栈框架
- [React 19](https://react.dev) - UI 库
- [Tailwind CSS 4](https://tailwindcss.com) - 样式框架
- [ONNX Runtime Web](https://onnxruntime.ai) - 浏览器端 AI 推理
- [browser-image-compression](https://github.com/nicholasKlick/browser-image-compression) - 图片压缩库
- [JSZip](https://stuk.github.io/jszip/) - ZIP 文件生成
- [file-saver](https://github.com/nicholasKlick/file-saver) - 文件下载

## 🚀 快速开始

```bash
# 安装依赖
bun install

# 启动开发服务器
bun dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

### 🖥️ Web UI

站点共 20 个工具页面:原有 9 个工具仍完全在浏览器里跑(不经过服务端);新增的 11 个游戏资源流水线工具是服务端操作(主要为 `sharp`,视频抽帧走内置 ffmpeg),页面如下:

- `/video-to-frames` — 视频转序列帧
- `/atlas-packer` — 图集打包
- `/sequence-to-sheet` — 序列帧打包
- `/sheet-to-sequence` — 序列帧导出
- `/nine-slice` — 九宫格切分
- `/palette-swap` — 调色板替换
- `/palette-extract` — 调色板提取
- `/asset-lint` — 资源规范检查
- `/trim` — 透明边裁剪
- `/alpha-bleed` — Alpha 边缘外扩
- `/png-optimize` — PNG 优化

这些流水线页面统一调用本项目自己的 `POST /api/tools/{tool}`;大部分共用面板组件 `app/components/ApiToolPanel.tsx`(选项 schema 定义在 `app/lib/api-tools.ts`),视频转序列帧使用自己的页面组件(`app/(tools)/video-to-frames/client.tsx`)。因此它们需要 app 本身在运行(页面和接口都由它提供);原有 9 个工具不经过服务端,浏览器里即可完成。

## 📦 构建部署

```bash
# 构建生产版本
bun run build

# 启动生产服务器
bun start
```

## 🤖 AI / 程序化调用

除了浏览器 UI,项目提供三个共用同一核心层(`core/`)的机器入口,可被 AI Agent、脚本或其他程序直接调用:

| 入口 | 用途 |
|---|---|
| **HTTP API** | `POST /api/tools/{tool}`,适合远程/跨语言调用 |
| **MCP Server** | stdio 方式挂载到支持 MCP 的 AI 客户端(ZCode、Claude、Cursor 等) |
| **CLI** | 本地命令行批处理 |

支持的工具有 21 个:

**服务端(sharp / ffmpeg,HTTP API / MCP / CLI 均可用)**——18 个:`compress`(压缩/格式转换)、`resize`(缩放)、`crop`(裁剪)、`transform`(旋转/翻转)、`background-remover`(纯色抠图)、`sprite-splitter`(精灵图拆分)、`vectorize`(矢量化)、`atlas-packer`(图集打包)、`sequence-to-sheet`(序列帧打包)、`sheet-to-sequence`(序列帧导出)、`nine-slice`(九宫格切分)、`palette-swap`(调色板替换)、`palette-extract`(调色板提取)、`asset-lint`(资源规范检查)、`trim`(透明边裁剪)、`alpha-bleed`(Alpha 边缘外扩)、`png-optimize`(PNG 无损优化/调色板量化)、`video-to-frames`(视频转序列帧)。

**浏览器 AI(MCP 专用,通过无头浏览器驱动)**——3 个:`upscale`(Real-ESRGAN 4x 超分)、`background-remover-ai`(ISNet AI 抠图 / 通道阈值抠图)、`inpaint`(MiGAN 去水印/消除物体)。
即 MCP 共 21 个工具(18 个服务端 + 3 个浏览器 AI);HTTP API 与 CLI 只提供上面 18 个服务端工具,3 个浏览器 AI 工具仅 MCP 可用。

### HTTP API

```bash
# 查看所有工具及参数 schema
curl http://localhost:3000/api/tools

# multipart 上传
curl -X POST -F "file=@photo.png" \
  -F 'options={"format":"jpeg","quality":80}' \
  http://localhost:3000/api/tools/compress -o out.jpg

# JSON base64
curl -X POST -H "Content-Type: application/json" \
  -d '{"image_base64":"...","options":{"tolerance":10}}' \
  http://localhost:3000/api/tools/background-remover -o out.png
```

多文件结果(如精灵图拆分、图集打包)返回 `.zip`。`GET /api/tools/{tool}` 可查询单个工具的参数说明。

多图工具(如 `atlas-packer`)重复给 `file` 字段,或用 JSON 的 `images_base64` 数组:

```bash
curl -X POST -F "file=@hero.png" -F "file=@coin.png" \
  -F 'options={"padding":4,"name":"ui"}' \
  http://localhost:3000/api/tools/atlas-packer -o ui.zip

curl -X POST -H "Content-Type: application/json" \
  -d '{"images_base64":["...","..."],"names":["hero.png","coin.png"],"options":{"padding":4}}' \
  http://localhost:3000/api/tools/atlas-packer -o ui.zip
```

### MCP Server

```json
{
  "mcpServers": {
    "image-master": {
      "command": "bun",
      "args": ["/path/to/image-master/mcp/server.ts"],
      "env": {
        "IMAGE_MASTER_OUTPUT_DIR": "/tmp/im-output",
        "IMAGE_MASTER_BROWSER_PROXY": "http://127.0.0.1:10808"
      }
    }
  }
}
```

每个工具接受本地图片路径参数 `path` 及各工具选项,处理结果写入输出目录并返回文件路径。多图工具(如 `atlas-packer`)用 `paths` 传路径数组。

### CLI

```bash
bun cli.ts compress a.png format=webp quality=70
bun cli.ts resize a.png width=200 fit=cover
bun cli.ts sprite-splitter sheet.png mode=grid columns=4 rows=2
bun cli.ts atlas-packer a.png b.png c.png name=ui padding=4   # 多图工具直接给多个路径
bun cli.ts asset-lint --dir ./assets powerOfTwo=true --fail-on-issues   # CI:报告 ok=false 时退出码 1
```

输出默认写入 `./output/`,可用 `--out` 指定;`--dir <folder>` 把文件夹内的图片批量作为输入(无需逐个列路径)。运行 `bun cli.ts` 查看全部工具与参数。

`--fail-on-issues` 用于 CI:写出的 JSON 报告里 `ok === false` 时以退出码 1 结束(目前只有 `asset-lint` 会产出这种报告);环境变量 `IMAGE_MASTER_FAIL_ON_ISSUES=1` 等价。不加这个开关时退出码保持 0,已有脚本不受影响。

### AI 工具(MCP)

`upscale` / `background-remover-ai` / `inpaint` 依赖 ONNX Runtime Web + Web Worker,只能跑在浏览器里。MCP server 通过 `playwright-core` 驱动一个无头浏览器,访问本地 web app 完成推理,再把结果 Blob 取回写入输出目录。`background-remover-ai` 默认请求 WebGPU 推理(onnxruntime-web),浏览器/驱动不支持或推理报错时自动回退 CPU WASM,且回退后本批剩余图片沿用 CPU;`upscale` / `inpaint` 走 CPU WASM。因此:

- 需要 app 在运行(默认 `http://localhost:3000`);未运行时 MCP 会自动 `bun dev` 拉起(`IMAGE_MASTER_AUTOSTART=false` 可关闭)。
- 需要本机有 Edge 或 Chrome;首次调用会下载模型(Real-ESRGAN ~64MB、ISNet 42/84/168MB 可选、MiGAN ~27MB;WebGPU 路径额外 ~22MB wasm)并缓存在浏览器 profile 中。
- 若网络无法直连模型源(HuggingFace / imgly CDN),设置 `IMAGE_MASTER_BROWSER_PROXY` 让浏览器走代理。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `IMAGE_MASTER_BASE_URL` | `http://localhost:3000` | web app 地址 |
| `IMAGE_MASTER_AUTOSTART` | `true` | 未就绪时自动 `bun dev` |
| `IMAGE_MASTER_BROWSER_CHANNEL` | `msedge` | `msedge` / `chrome` |
| `IMAGE_MASTER_BROWSER_PROXY` | — | 例:`http://127.0.0.1:10808` |
| `IMAGE_MASTER_BROWSER_PROFILE_DIR` | `~/.image-master/browser-profile` | 模型缓存 |
| `IMAGE_MASTER_BROWSER_HEADLESS` | `true` | 设为 `false` 可看到浏览器 |

`inpaint` 用 `regions`(图片像素坐标的矩形数组)或 `maskPath`(遮罩图片,标记区域 alpha>128)指定要修复的范围。`background-remover-ai` 用 `mode`(`ai` / `channel`)选择 AI 或通道模式,`model` 可选 `isnet` / `isnet_fp16` / `isnet_quint8`,省略时用页面默认(`isnet_quint8`,42MB,速度最快)。示例:

```jsonc
{ "path": "C:/img/photo.png", "regions": [{ "x": 1355, "y": 1408, "width": 175, "height": 110 }] }
{ "path": "C:/img/hero.png", "mode": "ai", "model": "isnet_quint8" }
```

> 服务端原生实现(把三个模型直接跑在 `onnxruntime-node` 上)仍在计划中,可省掉浏览器与 app 依赖。

## 🌟 特点

- 🔒 **隐私安全** - 原有 9 个工具的处理均在浏览器本地完成，图片不会上传到服务器；11 个流水线工具由自托管服务端（`sharp` / ffmpeg）处理，只经过你自己运行的 app 服务器进程，不会上传到第三方
- 🚀 **高性能** - 使用 Web Worker 多线程处理，不阻塞主线程；AI 抠图默认启用 WebGPU 推理，不可用时自动回退 CPU
- 📱 **响应式设计** - 适配桌面和移动设备
- 🎯 **批量处理** - 大部分工具支持同时处理多张图片
- 💾 **离线可用** - AI 模型下载后缓存在本地，后续使用无需网络

## 📄 License

MIT


