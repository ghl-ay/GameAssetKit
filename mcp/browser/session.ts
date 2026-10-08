/**
 * Shared browser lifecycle for the AI (browser-only) MCP tools.
 *
 * The three AI tools (upscale / AI background removal / inpaint) rely on ONNX
 * Runtime Web + Web Workers, so they can only run inside a real browser page.
 * These helpers boot the app if needed and keep one persistent Chromium page
 * alive so the downloaded ONNX models stay cached between tool calls.
 */
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..");

export function baseUrl(): string {
  return (process.env.IMAGE_MASTER_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function defaultOutDir(): string {
  return process.env.IMAGE_MASTER_OUTPUT_DIR ?? path.join(PROJECT_ROOT, "output");
}

function profileDir(): string {
  return (
    process.env.IMAGE_MASTER_BROWSER_PROFILE_DIR ??
    path.join(os.homedir(), ".image-master", "browser-profile")
  );
}

async function reachable(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500;
  } catch {
    return false;
  }
}

let startedApp: ReturnType<typeof spawn> | null = null;

/** Make sure the Next.js app is serving; optionally boot it in the background. */
export async function ensureApp(): Promise<string> {
  const url = baseUrl();
  if (await reachable(url)) return url;

  if (process.env.IMAGE_MASTER_AUTOSTART === "false") {
    throw new Error(
      `Image Master is not reachable at ${url}. Start it first (bun dev) or set IMAGE_MASTER_BASE_URL.`
    );
  }

  if (!startedApp) {
    startedApp = spawn(process.env.IMAGE_MASTER_START_CMD ?? "bun", ["dev"], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    startedApp.unref();
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    if (await reachable(url)) return url;
  }
  throw new Error(`Timed out waiting for Image Master to start at ${url}`);
}

let context: BrowserContext | null = null;
let page: Page | null = null;

async function launchContext(): Promise<BrowserContext> {
  const proxy = process.env.IMAGE_MASTER_BROWSER_PROXY;
  const channel = process.env.IMAGE_MASTER_BROWSER_CHANNEL ?? "msedge";
  const headless = process.env.IMAGE_MASTER_BROWSER_HEADLESS !== "false";

  const options = {
    headless,
    channel,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    ...(proxy ? { proxy: { server: proxy } } : {}),
  } as const;

  try {
    return await chromium.launchPersistentContext(profileDir(), options);
  } catch (error) {
    if (channel !== "chrome") throw error;
    return await chromium.launchPersistentContext(profileDir(), { ...options, channel: "msedge" });
  }
}

/** Reuse a single page across tool calls so ONNX models stay warm. */
export async function getPage(): Promise<Page> {
  const url = await ensureApp();
  if (!context || context.pages().length === 0) {
    context = await launchContext();
  }
  if (!page || page.isClosed()) {
    page = context.pages()[0] ?? (await context.newPage());
  }
  if (!page.url().startsWith(url)) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
  return page;
}

export async function closeBrowser(): Promise<void> {
  const ctx = context;
  context = null;
  page = null;
  if (ctx) await ctx.close().catch(() => {});
}
