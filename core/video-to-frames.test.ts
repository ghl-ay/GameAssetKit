import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractVideoFrames, renderTestVideo } from "./video-to-frames";

let tempDir: string;
let videoBuffer: Buffer;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "image-master-frames-test-"));
  const videoPath = join(tempDir, "clip.mp4");
  // 1 秒 64x64 的 6fps 测试视频,共 6 帧
  await renderTestVideo(videoPath);
  videoBuffer = await readFile(videoPath);
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("extractVideoFrames", () => {
  test("提取全部帧并输出元数据 JSON", async () => {
    const results = await extractVideoFrames(videoBuffer, {}, "clip");

    // 6 帧画面 + 1 个 JSON
    expect(results.length).toBe(7);
    expect(results[0].name).toBe("clip_0001.png");
    expect(results[5].name).toBe("clip_0006.png");
    expect(results[6].name).toBe("clip_frames.json");

    const frame = results[0];
    expect(frame.contentType).toBe("image/png");
    expect(frame.width).toBe(64);
    expect(frame.height).toBe(64);

    const metadata = JSON.parse(results[6].buffer.toString("utf-8"));
    expect(metadata.count).toBe(6);
    expect(metadata.fps).toBe("source");
    expect(metadata.truncated).toBe(false);
  });

  test("fps 过滤帧率", async () => {
    const results = await extractVideoFrames(videoBuffer, { fps: 3 }, "clip");
    const frames = results.filter((result) => result.ext === "png");
    // 1 秒 @3fps ≈ 3 帧
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames.length).toBeLessThanOrEqual(4);
  });

  test("maxFrames 截断并标记 truncated", async () => {
    const results = await extractVideoFrames(videoBuffer, { maxFrames: 2 }, "clip");
    const frames = results.filter((result) => result.ext === "png");
    expect(frames.length).toBe(2);

    const metadata = JSON.parse(results[results.length - 1].buffer.toString("utf-8"));
    expect(metadata.truncated).toBe(true);
  });

  test("时间范围截取", async () => {
    const full = await extractVideoFrames(videoBuffer, {}, "clip");
    const partial = await extractVideoFrames(
      videoBuffer,
      { start: 0.6, end: 1.0 },
      "clip"
    );
    const partialFrames = partial.filter((result) => result.ext === "png");
    expect(partialFrames.length).toBeGreaterThan(0);
    expect(partialFrames.length).toBeLessThan(full.length - 1);
  });

  test("webp 输出格式", async () => {
    const results = await extractVideoFrames(videoBuffer, { format: "webp" }, "clip");
    expect(results[0].name).toBe("clip_0001.webp");
    expect(results[0].contentType).toBe("image/webp");
  });

  test("start 晚于 end 报错", async () => {
    expect(
      extractVideoFrames(videoBuffer, { start: 0.8, end: 0.2 }, "clip")
    ).rejects.toThrow("end 必须大于 start");
  });

  test("无效视频报错", async () => {
    expect(extractVideoFrames(Buffer.from("not a video"), {}, "broken")).rejects.toThrow();
  });
});
