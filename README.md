# Image Master

浏览器 + 自托管服务端的图片处理工具集：**20 个 Web 工具**、**21 个 MCP 工具**、**18 个 HTTP API / CLI 工具**，共用同一套 `core/` 实现。

- **零密钥**：不需要任何 API Key 或云服务
- **自托管**：图片只经过你本机运行的进程，不上传第三方
- **两种执行方式**：9 个工具纯浏览器本地处理；11 个游戏资源流水线工具走本地 `sharp` / `ffmpeg`

---

## 🤖 For AI Agents（从这里开始）

> **给 AI 的指令**：只读本节即可完成安装、验证和启动；除非需要工具参数细节，无需阅读其余章节。

### 0. 项目摘要（机器可读）

```json
{
  "name": "image-master",
  "stack": ["TypeScript", "Next.js 16", "React 19", "Bun"],
  "packageManager": "bun",
  "runtime": { "bun": ">=1.2", "node": ">=20.9" },
  "defaultPort": 3000,
  "requiresSecrets": false,
  "requiresDocker": false,
  "requiresDatabase": false,
  "install": ["bun install"],
  "verify": ["bun cli.ts help", "bun test", "bun run build"],
  "start": "bun dev",
  "healthcheck": "GET http://localhost:3000/api/tools"
}
```

### 1. 环境检查

```bash
bun --version    # 要求 >= 1.2（实测 1.4.2）
node --version   # 要求 >= 20.9
```

缺少 Bun 时安装：

```bash
# Windows PowerShell
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

### 2. 安装

```bash
git clone https://gitee.com/ghl666/material-tools.git
cd material-tools
bun install
```

首次安装会下载 `ffmpeg-static` 的二进制（约 80MB），耗时可能超过 2 分钟。

网络受限时先启动代理，再重试（只对当前命令生效，不修改全局配置）：

```powershell
# Windows PowerShell
$env:HTTPS_PROXY="http://127.0.0.1:7877"; $env:HTTP_PROXY="http://127.0.0.1:7877"; bun install
```

```bash
# macOS / Linux
HTTPS_PROXY=http://127.0.0.1:7877 HTTP_PROXY=http://127.0.0.1:7877 bun install
```

### 3. 验证（全部必须通过）

| 命令 | 期望结果 |
|---|---|
| `bun cli.ts help` | 列出 **18** 个服务端工具，退出码 `0` |
| `bun test` | 退出码 `0`（当前 159 pass / 0 fail） |
| `bun run build` | 输出 Next.js 路由表，退出码 `0` |
| `GET http://localhost:3000/api/tools` | JSON 包含 `tools` 数组 |

一次性执行：

```bash
# macOS / Linux
bun cli.ts help >/dev/null && bun test && bun run build
```

```powershell
# Windows PowerShell
bun cli.ts help | Out-Null; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; bun test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; bun run build
```

### 4. 启动与健康检查

```bash
bun dev
```

看到 `Ready` 后，在另一个终端执行（AI/CI 无人值守时请用后台进程，结束时记得关闭）：

```bash
curl http://localhost:3000/api/tools
curl http://localhost:3000/api/tools/compress
```

```powershell
# Windows PowerShell
Invoke-WebRequest http://localhost:3000/api/tools | Select-Object -ExpandProperty Content
```

`/api/tools` 返回工具清单，`/api/tools/{tool}` 返回该工具的 JSON Schema 参数说明。

### 5. 选择调用入口

| 场景 | 入口 | 用法 |
|---|---|---|
| 一次性批处理 | **CLI** | `bun cli.ts <tool> <input...> key=value ...` |
| 脚本 / 跨语言调用 | **HTTP API** | `POST /api/tools/{tool}` |
| AI Agent 工具调用 | **MCP** | `bun mcp/server.ts`（stdio） |
| 人工操作 | **Web UI** | `http://localhost:3000` |

### 6. 完成标准

- [ ] `bun install` 退出码 `0`
- [ ] `bun cli.ts help` 列出 18 个工具
- [ ] `bun test` 全部通过
- [ ] `bun run build` 成功
- [ ] `GET /api/tools` 返回 `200` + JSON

### 7. 失败处理

| 现象 | 原因 | 处理 |
|---|---|---|
| `bun: command not found` | 未安装 Bun | 执行第 1 节安装命令 |
| `Cannot find package 'ffmpeg-static'` | 依赖未完整安装 | 重新执行 `bun install` |
| `install script from "ffmpeg-static" exited with 1` 或 `Request timed out` | 下载 ffmpeg 超时 | 设置代理后执行 `node node_modules/ffmpeg-static/install.js` |
| `sharp` 加载失败 | 平台二进制不匹配 | 删除 `node_modules` 后重新 `bun install` |
| 端口 3000 被占用 | 其他进程占用 | 用 `bunx next dev -p 3001`，并设置 `IMAGE_MASTER_BASE_URL=http://localhost:3001` |
| AI 模型下载失败 | 无法访问 HuggingFace / imgly CDN | 设置 `IMAGE_MASTER_BROWSER_PROXY` |
| WebGPU 不可用 | 浏览器或驱动不支持 | 自动回退 CPU WASM，无需处理 |

### 8. AI 操作约束

- 必须使用 **Bun**；不要用 `npm` / `pnpm` / `yarn`（`trustedDependencies` 等配置只对 Bun 生效）。
- 不要读取或索引 `node_modules/`、`.next/`、`output/`，会浪费上下文。
- `output/` 已加入 `.gitignore`，不要提交处理结果。
- 3 个浏览器 AI 工具（`upscale`、`background-remover-ai`、`inpaint`）只通过 MCP 提供，需要本机 Edge 或 Chrome。
- 首次调用 AI 工具会下载模型（27–168MB），属于正常行为。

---

## 🚀 快速开始（人类）

```bash
bun install
bun dev
```

打开 [http://localhost:3000](http://localhost:3000)。

生产构建：

```bash
bun run build
bun start
```

---

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

后 11 个工具是给游戏资源批处理准备的，和已有的 `sprite-splitter`（拆图）组成完整闭环：

| 工具 | 作用 |
|---|---|
| `atlas-packer` | **多图**打包成一张图集(PNG/WebP)+ TexturePacker JSON Hash 元数据。MaxRects 装箱、`padding` 间距、`extrude` 把精灵边缘颜色外扩进留白、`trim` 先裁掉透明边、`powerOfTwo` 补成 2 的幂、`maxWidth`/`maxHeight` 限制尺寸 |
| `trim` | 裁掉四周透明边，可加透明留白(`padding`)、补正方形(`square`)、补 2 的幂(`powerOfTwo`)，`anchor` 指定内容落在画布的哪个位置 |
| `alpha-bleed` | 把透明像素的 RGB 换成最近的可见像素颜色(边缘外扩)，`alpha` 不变 —— 消除缩放、mipmap、图集采样时的黑边/灰边；`unpremultiply` 还原黑底预乘的半透明边缘 |
| `video-to-frames` | 用内置 ffmpeg 把视频(mp4/webm/mov/gif 等)抽成序列帧：`fps` 省略时逐帧提取，`start`/`end` 按秒截取，`width`/`scale` 等比缩放，`format` 可选 png/webp/jpeg，`maxFrames` 限制帧数(默认 300)；带透明通道的 WebM(VP9)可产出带 alpha 的帧。输出帧图片 + 元数据 JSON |
| `sequence-to-sheet` | **多图**把序列帧排成等距网格的 spritesheet：每帧先取可见内容，再按 `anchor` 对齐到统一单元格(角色动画用 `bottom`/`bottom-center` 消除脚底漂移)，`columns`/`padding`/`extrude`/`fps`/`powerOfTwo` |
| `sheet-to-sequence` | 反方向：按网格(`padding` 感知)把 spritesheet 切成从 `0001` 开始补零的单帧 PNG，可 `trim` 每帧透明边；`cellWidth`/`cellHeight` 用于补过 2 的幂的图集 |
| `nine-slice` | 九宫格(9-slice / nine-patch)UI 资源：输出 `borders`、`minimumSize` 与九个区域坐标的 JSON，并导出各区域切片 PNG(`slices=false` 时只输出 JSON 描述，适合批量分析)。边框可显式指定，也可自动识别(以中心像素为内部色，沿中间行/列扩展，装饰环与圆角都会算进边框) |
| `palette-extract` | 统计图片实际使用的颜色(忽略全透明像素)，输出带占比的调色板 JSON + 色板示意图；超过上限时 `quantize=true` 用 libimagequant 量化取色(默认)，`false` 则按频率取前 N 种 |
| `palette-swap` | 换肤/队伍色：按 `map` 显式 from→to 替换，或给 `palette` 由 `order`(luminance/frequency/first)排序后整份替换；`tolerance` 容忍接近色，输出替换后的 PNG + 记录命中数的 JSON |
| `asset-lint` | 批量体检：**多图**检查 2 的幂(`powerOfTwo`)、整除对齐(`multipleOf`)、最大边长(`maxSize`)、格式白名单(`formats`)、透明通道(`alpha`)、单文件体积(`maxKilobytes`)、文件名正则(`namePattern`)，并顺带查出扩展名与实际格式不符、全透明空图、内容重复的文件。返回带 `ok` / 汇总 / 每个文件问题清单的 JSON 报告 |
| `png-optimize` | `mode=lossless` 用最高 zlib 力度无损重压；`mode=palette` 量化到 2-256 色(像素风资源常用) |

典型链路：`sprite-splitter` / `sheet-to-sequence` → `trim` → `alpha-bleed` → `sequence-to-sheet`（序列帧）或 `atlas-packer`（静态图集） → `png-optimize` → `asset-lint`（提交前体检）；视频素材走 `video-to-frames` →（可选 AI 抠图）→ `sequence-to-sheet` / `atlas-packer`；UI 面板走 `nine-slice` 拿到九宫格参数；换肤变体走 `palette-extract`（取色）→ `palette-swap`（批量替换）。

### 🔗 工具联动

- 所有工具之间可以互相传递图片，方便进行连续处理流程
- 处理结果可一键发送到其他工具继续处理
- 支持拖拽上传和剪贴板粘贴上传

---

## 🧰 工具一览

| 工具 | 输入 | 输出 | 入口 |
|---|---|---|---|
| `compress` | 图片 + `format` / `quality` | 图片 | API / CLI / MCP |
| `resize` | 图片 + `width` / `height` / `fit` | 图片 | API / CLI / MCP |
| `crop` | 图片 + `left` / `top` / `width` / `height` | 图片 | API / CLI / MCP |
| `transform` | 图片 + `rotate` / `flipH` / `flipV` | 图片 | API / CLI / MCP |
| `background-remover` | 图片 + `color` / `tolerance` | PNG | API / CLI / MCP |
| `sprite-splitter` | 精灵图 | ZIP / 多张 PNG | API / CLI / MCP |
| `vectorize` | 图片 | SVG | API / CLI / MCP |
| `atlas-packer` | 多张图片 | PNG/WebP + JSON（ZIP） | API / CLI / MCP |
| `trim` | 图片 + `padding` / `anchor` | PNG | API / CLI / MCP |
| `alpha-bleed` | 图片 + `radius` | PNG | API / CLI / MCP |
| `png-optimize` | 图片 + `mode` / `colors` | PNG | API / CLI / MCP |
| `sequence-to-sheet` | 多张序列帧 | PNG + JSON（ZIP） | API / CLI / MCP |
| `sheet-to-sequence` | spritesheet | 多张 PNG（ZIP） | API / CLI / MCP |
| `video-to-frames` | 视频 + `fps` / `width` / `format` | 多张帧 + JSON（ZIP） | API / CLI / MCP |
| `nine-slice` | UI 面板图 | JSON + 9 张切片 | API / CLI / MCP |
| `palette-swap` | 图片 + `map` / `palette` | PNG + JSON | API / CLI / MCP |
| `palette-extract` | 图片 + `maxColors` | JSON + 色板 PNG | API / CLI / MCP |
| `asset-lint` | 多张图片 | JSON 报告 | API / CLI / MCP |
| `upscale` | 图片 + `scale` | 放大图片 | **仅 MCP** |
| `background-remover-ai` | 图片 + `mode` / `model` | PNG | **仅 MCP** |
| `inpaint` | 图片 + `regions` / `maskPath` | PNG | **仅 MCP** |

完整的参数 schema 用 `bun cli.ts help` 或 `GET /api/tools/{tool}` 查询。

### 常见任务速查

```bash
# 压缩为 WebP
bun cli.ts compress a.png format=webp quality=70

# 批量裁掉透明边并补 2 的幂
bun cli.ts trim a.png padding=4 powerOfTwo=true anchor=bottom

# 打包图集
bun cli.ts atlas-packer a.png b.png c.png name=ui padding=4 trim=true

# 视频抽帧
bun cli.ts video-to-frames walk.mp4 fps=12 width=512 --out ./frames

# 序列帧合成 spritesheet
bun cli.ts sequence-to-sheet walk_*.png name=walk columns=3 anchor=bottom fps=12

# 九宫格分析
bun cli.ts nine-slice panel.png

# 批量资源体检（CI 失败时退出码 1）
bun cli.ts asset-lint --dir ./assets powerOfTwo=true maxSize=2048 --fail-on-issues
```

---

## 🛠️ 技术栈

- [Next.js 16](https://nextjs.org) - React 全栈框架
- [React 19](https://react.dev) - UI 库
- [Tailwind CSS 4](https://tailwindcss.com) - 样式框架
- [ONNX Runtime Web](https://onnxruntime.ai) - 浏览器端 AI 推理
- [sharp](https://sharp.pixelplumbing.com) - 服务端图像处理
- [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) - 内置视频抽帧
- [JSZip](https://stuk.github.io/jszip/) - ZIP 文件生成

---

## 🔌 机器入口

三个入口共用 `core/` 实现，能力一致（浏览器 AI 工具除外）。

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

多文件结果（如精灵图拆分、图集打包）返回 `.zip`。多图工具重复给 `file` 字段，或用 JSON 的 `images_base64` 数组：

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
      "args": ["F:/path/to/image-master/mcp/server.ts"],
      "env": {
        "IMAGE_MASTER_OUTPUT_DIR": "F:/path/to/image-master/output",
        "IMAGE_MASTER_BROWSER_PROXY": "http://127.0.0.1:7877"
      }
    }
  }
}
```

> 把 `F:/path/to/image-master` 替换为仓库绝对路径（Windows 用正斜杠可避免 JSON 转义）。

每个工具接受本地图片路径 `path` 及各工具选项，结果写入输出目录并返回文件路径；多图工具用 `paths` 传路径数组。

### CLI

```bash
bun cli.ts compress a.png format=webp quality=70
bun cli.ts resize a.png width=200 fit=cover
bun cli.ts sprite-splitter sheet.png mode=grid columns=4 rows=2
bun cli.ts atlas-packer a.png b.png c.png name=ui padding=4
bun cli.ts asset-lint --dir ./assets powerOfTwo=true --fail-on-issues
```

- 输出默认写入 `./output/`，可用 `--out <dir>` 指定
- `--dir <folder>` 把文件夹内的图片批量作为输入（仅当前层，不递归）
- `bun cli.ts help` 查看全部工具与参数
- `--fail-on-issues`：JSON 报告 `ok === false` 时退出码 `1`（目前仅 `asset-lint` 会产出）；环境变量 `IMAGE_MASTER_FAIL_ON_ISSUES=1` 等价

### 环境变量

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `IMAGE_MASTER_OUTPUT_DIR` | `<repo>/output` | MCP / CLI 输出目录 |
| `IMAGE_MASTER_BASE_URL` | `http://localhost:3000` | Web app 地址 |
| `IMAGE_MASTER_AUTOSTART` | `true` | AI 工具未就绪时自动 `bun dev` |
| `IMAGE_MASTER_BROWSER_CHANNEL` | `msedge` | `msedge` / `chrome` |
| `IMAGE_MASTER_BROWSER_PROXY` | — | 例：`http://127.0.0.1:7877` |
| `IMAGE_MASTER_BROWSER_PROFILE_DIR` | `~/.image-master/browser-profile` | 模型缓存目录 |
| `IMAGE_MASTER_BROWSER_HEADLESS` | `true` | 设为 `false` 可看到浏览器 |
| `IMAGE_MASTER_FAIL_ON_ISSUES` | — | 设为 `1` 等价 `--fail-on-issues` |

### AI 工具（仅 MCP）

`upscale` / `background-remover-ai` / `inpaint` 依赖 ONNX Runtime Web + Web Worker，只能跑在浏览器里。MCP server 通过 `playwright-core` 驱动无头浏览器，访问本地 web app 完成推理，再把结果取回写入输出目录。

- 需要 app 在运行（默认 `http://localhost:3000`）；未运行时 MCP 会自动 `bun dev` 拉起（`IMAGE_MASTER_AUTOSTART=false` 可关闭）
- 需要本机有 Edge 或 Chrome；首次调用会下载模型并缓存在浏览器 profile 中
- `background-remover-ai` 默认请求 WebGPU，不可用时自动回退 CPU WASM
- 网络无法直连模型源时，设置 `IMAGE_MASTER_BROWSER_PROXY`

```jsonc
{ "path": "C:/img/photo.png", "regions": [{ "x": 1355, "y": 1408, "width": 175, "height": 110 }] }
{ "path": "C:/img/hero.png", "mode": "ai", "model": "isnet_quint8" }
```

---

## 🗂️ 项目结构

```text
core/            # 18 个服务端工具的统一实现（sharp / ffmpeg）
mcp/server.ts    # MCP stdio 入口（21 个工具）
mcp/browser/     # 浏览器 AI 工具桥接（playwright-core）
cli.ts           # CLI 入口
app/api/tools/   # HTTP API 路由
app/(tools)/     # 各工具 Web 页面
app/lib/         # 工具参数 schema / API 客户端
```

---

## 📦 构建部署

```bash
bun run build
bun start
```

生产环境需要能执行 `sharp` 与 `ffmpeg-static` 二进制；无需数据库或外部服务。

---

## 📄 License

MIT

