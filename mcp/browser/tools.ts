/**
 * Browser-driven implementations of the three AI tools that only exist in the
 * web UI (ONNX Runtime Web + Web Workers):
 *
 *   - upscale                Real-ESRGAN 4x super resolution
 *   - background-remover-ai  ISNet (@imgly) / channel-threshold matting
 *   - inpaint                MiGAN inpainting from rectangles or a mask image
 *
 * Every tool drives the real page and pulls the resulting Blob straight out of
 * the page to disk.
 */
import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright-core";
import { getPage, defaultOutDir } from "./session";
import { startBlobReceiver } from "./blob-receiver";

const RESULT_BUTTON_TIMEOUT = 40 * 60 * 1000;
const UPLOAD_ATTEMPTS = 3;

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

function toolUrl(toolPath: string): string {
  const base = (process.env.IMAGE_MASTER_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${toolPath}`;
}

/**
 * Navigate to a tool and upload the input image.
 *
 * The app is a client component, so a `change` event fired before hydration is
 * silently dropped; the upload is retried until the post-upload UI shows up.
 */
async function openTool(page: Page, toolPath: string, inputPath: string, readySelector: string): Promise<void> {
  const absolute = path.resolve(inputPath);
  if (!fs.existsSync(absolute)) throw new Error(`input image not found: ${absolute}`);

  await page.goto(toolUrl(toolPath), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});

  let lastError: unknown;
  for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt++) {
    try {
      await page.locator('input[type="file"]').first().setInputFiles(absolute);
      await page.locator(readySelector).first().waitFor({ state: "visible", timeout: 10_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1000);
    }
  }
  throw new Error(
    `uploading ${absolute} to ${toolPath} did not take effect (${(lastError as Error)?.message ?? "unknown"})`
  );
}

/** Pull the processed Blob out of the page and write it to disk. */
async function pullBlob(page: Page, imgSelector: string, outDir: string): Promise<string> {
  const img: Locator = page.locator(imgSelector).first();
  await img.waitFor({ state: "visible", timeout: 60_000 });

  const receiver = await startBlobReceiver(outDir);
  try {
    const waitForFile = receiver.next(180_000);
    await img.evaluate(async (el, port) => {
      const target = el as HTMLImageElement;
      const res = await fetch(target.src);
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("result blob is empty");
      await fetch(`http://127.0.0.1:${port}/save?name=${encodeURIComponent(target.alt || "output.png")}`, {
        method: "POST",
        body: blob,
      });
      return blob.size;
    }, receiver.port);
    return await waitForFile;
  } finally {
    await receiver.dispose();
  }
}

export interface UpscaleOptions {
  outDir?: string;
}

export async function runUpscale(inputPath: string, options: UpscaleOptions = {}): Promise<string> {
  const page = await getPage();
  await openTool(page, "/upscale", inputPath, 'button:has-text("开始 4x 放大")');
  await page.getByRole("button", { name: "开始 4x 放大" }).click();
  await page.getByRole("button", { name: "下载图片" }).waitFor({ state: "visible", timeout: RESULT_BUTTON_TIMEOUT });
  return pullBlob(page, 'img[alt$="_x4.png"]', options.outDir ?? defaultOutDir());
}

export interface BackgroundRemoveAiOptions {
  outDir?: string;
  mode?: "ai" | "channel";
  model?: "isnet" | "isnet_fp16" | "isnet_quint8";
}

/**
 * AI 模型选项按钮的可访问名前缀（UI 会把描述拼进按钮名，故只锚定开头）。
 * 省略 model 时不点击，走页面默认（quint8）。
 */
const MODEL_BUTTON_NAME: Record<NonNullable<BackgroundRemoveAiOptions["model"]>, RegExp> = {
  isnet: /^标准/,
  isnet_fp16: /^高性能/,
  isnet_quint8: /^轻量/,
};

export async function runBackgroundRemoveAi(
  inputPath: string,
  options: BackgroundRemoveAiOptions = {}
): Promise<string> {
  // 冷 profile 首次加载时页面会重挂载（dev HMR/首编译），模式点击可能间歇性
  // 落空，与上传一样整段重试。
  let lastError: unknown;
  let page: Page | undefined;
  for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt++) {
    try {
      page = await getPage();
      await openTool(page, "/background-remover", inputPath, 'button:has-text("AI 智能")');

      if ((options.mode ?? "ai") === "channel") {
        await page.getByRole("button", { name: "按通道" }).click();
        await page.getByRole("button", { name: "通道抠图" }).click();
      } else {
        await page.getByRole("button", { name: "AI 智能" }).click();
        if (options.model) {
          await page.getByRole("button", { name: MODEL_BUTTON_NAME[options.model] }).click();
        }
        await page.getByRole("button", { name: "AI 一键移除背景" }).click();
      }
      break;
    } catch (error) {
      lastError = error;
      page = undefined;
    }
  }
  if (!page) {
    throw new Error(
      `selecting options on /background-remover failed after ${UPLOAD_ATTEMPTS} attempts: ${(lastError as Error)?.message ?? "unknown"}`
    );
  }

  await page.getByRole("button", { name: "下载图片" }).waitFor({ state: "visible", timeout: RESULT_BUTTON_TIMEOUT });
  return pullBlob(page, "img.max-h-32", options.outDir ?? defaultOutDir());
}

export interface InpaintOptions {
  outDir?: string;
  /** Rectangles (image pixel coordinates) to erase. */
  regions?: Region[];
  /** Optional mask image path; marked pixels (alpha > 128) are erased. */
  maskPath?: string;
}

export async function runInpaint(inputPath: string, options: InpaintOptions = {}): Promise<string> {
  if (!options.regions?.length && !options.maskPath) {
    throw new Error("inpaint needs either regions or maskPath");
  }

  const page = await getPage();
  await openTool(page, "/inpaint", inputPath, 'button:has-text("更换图片")');

  // Painting only exists in the fullscreen editor, which is also the only place
  // the app exposes the process action.
  // The hover overlay swallows real clicks, so trigger the wrapper programmatically.
  await page.locator("canvas").first().evaluate((el) => (el.parentElement as HTMLElement).click());
  await page.getByRole("heading", { name: "涂抹编辑" }).waitFor({ state: "visible", timeout: 30_000 });

  let dataUrl: string | null = null;
  if (options.maskPath) {
    const maskAbsolute = path.resolve(options.maskPath);
    if (!fs.existsSync(maskAbsolute)) throw new Error(`mask image not found: ${maskAbsolute}`);
    const ext = path.extname(maskAbsolute).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    dataUrl = `data:${mime};base64,${fs.readFileSync(maskAbsolute).toString("base64")}`;
  }

  const regionPayload = options.regions ?? [];
  await page.locator('canvas[style*="cursor: none"]').evaluate(
    async (el, payload) => {
      const canvas = el as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context on the mask canvas");
      ctx.fillStyle = "rgb(239, 68, 68)";

      for (const region of payload.regions) {
        ctx.fillRect(region.x, region.y, region.width, region.height);
      }

      if (payload.dataUrl) {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("failed to load the mask image"));
          image.src = payload.dataUrl as string;
        });
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      }

      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) painted++;
      if (painted === 0) throw new Error("mask is empty after drawing");
      return painted;
    },
    { regions: regionPayload, dataUrl }
  );

  await page.getByRole("button", { name: "修复" }).click();
  await page.getByRole("button", { name: "下载图片" }).waitFor({ state: "visible", timeout: RESULT_BUTTON_TIMEOUT });
  return pullBlob(page, "img[alt]", options.outDir ?? defaultOutDir());
}

