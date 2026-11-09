import Link from "next/link";
import { TOOLS, SITE_URL, SITE_NAME } from "./types";
import { ToolIcon } from "./components/tool-icons";

function JsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "20 款免费在线图片处理工具：抠图、压缩、放大、裁剪、矢量化，以及图集打包、序列帧、视频抽帧、九宫格、调色板替换与资源体检等游戏资源流水线工具。",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CNY",
    },
    featureList: TOOLS.map((t) => t.name),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}


export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <JsonLd />
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Image Master</h1>
              <p className="text-xs text-zinc-500">隐私优先的纯前端图片处理工具</p>
            </div>
          </div>
          <a
            href="https://github.com/moonrailgun/image-master"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
            强大的在线图片处理工具箱
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            20 款专业图片工具：抠图、压缩、放大、裁剪、矢量化，以及图集打包、序列帧、视频抽帧、九宫格、调色板与资源体检等游戏资源流水线工具。
            常用处理仍在浏览器本地完成；流水线工具由自托管服务处理，不经过第三方服务器。
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link
              key={tool.key}
              href={tool.path}
              className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-zinc-700 hover:bg-zinc-900"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-emerald-400 transition-colors group-hover:bg-emerald-500/10">
                <ToolIcon icon={tool.icon} className="h-8 w-8" strokeWidth={1.5} />
              </div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">{tool.name}</h3>
                {tool.serverSide && (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                    本机服务
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-zinc-400">
                {tool.description}
              </p>
            </Link>
          ))}
        </section>

        <section className="mt-16 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8">
          <h2 className="mb-6 text-center text-2xl font-bold text-white">
            为什么选择 Image Master？
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="mb-1 font-semibold text-white">隐私安全</h3>
              <p className="text-sm text-zinc-400">
                基础图像处理完全在浏览器本地完成；图集、序列帧、九宫格等流水线工具由自托管服务处理，同样不经过第三方
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="mb-1 font-semibold text-white">快速高效</h3>
              <p className="text-sm text-zinc-400">
                无需等待上传下载，利用本地计算资源即时处理，支持批量操作
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <h3 className="mb-1 font-semibold text-white">完全免费</h3>
              <p className="text-sm text-zinc-400">
                开源项目，所有功能完全免费使用，无水印、无次数限制
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800 py-8">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-6 grid grid-cols-3 gap-4 sm:grid-cols-5">
            {TOOLS.map((tool) => (
              <Link
                key={tool.key}
                href={tool.path}
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {tool.name}
              </Link>
            ))}
          </div>
          <p className="text-center text-sm text-zinc-600">
            基础图像处理在浏览器本地完成；流水线工具由自托管服务处理，不经过第三方
          </p>
          <p className="mt-2 text-center text-sm text-zinc-600">
            本项目基于{" "}
            <a
              href="https://github.com/moonrailgun/image-master"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200"
            >
              moonrailgun/image-master
            </a>{" "}
            二次开发，感谢原作者开源
          </p>
        </div>
      </footer>
    </div>
  );
}

