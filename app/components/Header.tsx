"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS } from "../types";
import { ToolIcon } from "./tool-icons";

export function Header() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeGroup = NAV_GROUPS.find((group) =>
    group.tools.some((tool) => tool.path === pathname)
  );
  const activeTool = activeGroup?.tools.find((tool) => tool.path === pathname);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="sticky top-0 z-40">
      <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Image Master</h1>
              <p className="text-xs text-zinc-500">隐私优先的纯前端图片处理工具</p>
            </div>
          </Link>
          <a
            href="https://github.com/moonrailgun/image-master"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          </a>
        </div>
      </header>

      <nav className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        {/* 桌面端：分类下拉导航 */}
        <div
          className="mx-auto hidden max-w-6xl px-6 md:block"
          onMouseLeave={() => setOpenGroup(null)}
        >
          <div className="flex items-center gap-1">
            {NAV_GROUPS.map((group) => {
              const isActive = activeGroup?.key === group.key;
              const isOpen = openGroup === group.key;
              return (
                <div
                  key={group.key}
                  className="relative"
                  onMouseEnter={() => setOpenGroup(group.key)}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenGroup(group.key)}
                    className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-emerald-500 text-emerald-400"
                        : "border-transparent text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <ToolIcon icon={group.icon} className="h-4 w-4" />
                    {group.name}
                    <svg
                      className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div
                      className={`absolute left-0 top-full z-50 rounded-xl border border-zinc-800 bg-zinc-900 p-2 shadow-2xl shadow-black/60 ${
                        group.wide ? "grid w-[32rem] grid-cols-2 gap-1" : "w-80"
                      }`}
                    >
                      {group.tools.map((tool) => {
                        const isCurrent = pathname === tool.path;
                        return (
                          <Link
                            key={tool.key}
                            href={tool.path}
                            aria-current={isCurrent ? "page" : undefined}
                            onClick={() => setOpenGroup(null)}
                            className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                              isCurrent
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "text-zinc-200 hover:bg-zinc-800"
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                isCurrent
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              <ToolIcon icon={tool.icon} className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 text-sm font-medium">
                                {tool.name}
                                {tool.serverSide && (
                                  <span className="rounded-full bg-zinc-800 px-1.5 py-px text-[10px] text-zinc-500">
                                    本机服务
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-zinc-500">
                                {tool.description}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 移动端：当前工具 + 工具菜单 */}
        <div className="flex items-center justify-between px-4 py-2 md:hidden">
          <span className="truncate text-sm text-zinc-400">
            {activeTool ? (
              <>
                当前工具：<span className="font-medium text-emerald-400">{activeTool.name}</span>
              </>
            ) : (
              "选择一个工具"
            )}
          </span>
          <button
            type="button"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            <ToolIcon icon={mobileOpen ? "close" : "menu"} className="h-4 w-4" />
            工具
          </button>
        </div>
        {mobileOpen && (
          <div className="max-h-[70vh] overflow-y-auto border-t border-zinc-800 px-4 pb-4 pt-1 md:hidden">
            {NAV_GROUPS.map((group) => (
              <div key={group.key} className="py-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  <ToolIcon icon={group.icon} className="h-3.5 w-3.5" />
                  {group.name}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {group.tools.map((tool) => {
                    const isCurrent = pathname === tool.path;
                    return (
                      <Link
                        key={tool.key}
                        href={tool.path}
                        aria-current={isCurrent ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          isCurrent
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                            : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        <ToolIcon icon={tool.icon} className="h-4 w-4 shrink-0 text-current" />
                        <span className="truncate">{tool.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* 打开下拉时罩住页面，点击空白处收起 */}
      {openGroup && (
        <div
          className="fixed inset-0 -z-10"
          aria-hidden="true"
          onClick={() => setOpenGroup(null)}
        />
      )}
    </div>
  );
}
