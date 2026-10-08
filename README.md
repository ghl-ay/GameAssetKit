# Image Master

一个纯前端的图片处理工具，所有操作均在浏览器本地完成，**不会上传到服务器**。

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

支持的工具有 10 个:

**服务端(sharp,HTTP API / MCP / CLI 均可用)**——7 个:`compress`(压缩/格式转换)、`resize`(缩放)、`crop`(裁剪)、`transform`(旋转/翻转)、`background-remover`(纯色抠图)、`sprite-splitter`(精灵图拆分)、`vectorize`(矢量化)。

**浏览器 AI(MCP 专用,通过无头浏览器驱动)**——3 个:`upscale`(Real-ESRGAN 4x 超分)、`background-remover-ai`(ISNet AI 抠图 / ViTMatte 通道抠图)、`inpaint`(MiGAN 去水印/消除物体)。

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

多文件结果(如精灵图拆分)返回 `.zip`。`GET /api/tools/{tool}` 可查询单个工具的参数说明。

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

每个工具接受本地图片路径参数 `path` 及各工具选项,处理结果写入输出目录并返回文件路径。

### CLI

```bash
bun cli.ts compress a.png format=webp quality=70
bun cli.ts resize a.png width=200 fit=cover
bun cli.ts sprite-splitter sheet.png mode=grid columns=4 rows=2
```

输出默认写入 `./output/`,可用 `--out` 指定。运行 `bun cli.ts` 查看全部工具与参数。

### AI 工具(MCP)

`upscale` / `background-remover-ai` / `inpaint` 依赖 ONNX Runtime Web + Web Worker,只能跑在浏览器里。MCP server 通过 `playwright-core` 驱动一个无头浏览器,访问本地 web app 完成推理,再把结果 Blob 取回写入输出目录。因此:

- 需要 app 在运行(默认 `http://localhost:3000`);未运行时 MCP 会自动 `bun dev` 拉起(`IMAGE_MASTER_AUTOSTART=false` 可关闭)。
- 需要本机有 Edge 或 Chrome;首次调用会下载约 27–64MB 模型并缓存在浏览器 profile 中。
- 若网络无法直连模型源(HuggingFace / imgly CDN),设置 `IMAGE_MASTER_BROWSER_PROXY` 让浏览器走代理。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `IMAGE_MASTER_BASE_URL` | `http://localhost:3000` | web app 地址 |
| `IMAGE_MASTER_AUTOSTART` | `true` | 未就绪时自动 `bun dev` |
| `IMAGE_MASTER_BROWSER_CHANNEL` | `msedge` | `msedge` / `chrome` |
| `IMAGE_MASTER_BROWSER_PROXY` | — | 例:`http://127.0.0.1:10808` |
| `IMAGE_MASTER_BROWSER_PROFILE_DIR` | `~/.image-master/browser-profile` | 模型缓存 |
| `IMAGE_MASTER_BROWSER_HEADLESS` | `true` | 设为 `false` 可看到浏览器 |

`inpaint` 用 `regions`(图片像素坐标的矩形数组)或 `maskPath`(遮罩图片,标记区域 alpha>128)指定要修复的范围。示例:

```jsonc
{ "path": "C:/img/photo.png", "regions": [{ "x": 1355, "y": 1408, "width": 175, "height": 110 }] }
```

> 服务端原生实现(把三个模型直接跑在 `onnxruntime-node` 上)仍在计划中,可省掉浏览器与 app 依赖。

## 🌟 特点

- 🔒 **隐私安全** - 所有处理均在浏览器本地完成，图片不会上传到服务器
- 🚀 **高性能** - 使用 Web Worker 多线程处理，不阻塞主线程
- 📱 **响应式设计** - 适配桌面和移动设备
- 🎯 **批量处理** - 大部分工具支持同时处理多张图片
- 💾 **离线可用** - AI 模型下载后缓存在本地，后续使用无需网络

## 📄 License

MIT


