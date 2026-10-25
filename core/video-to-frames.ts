import { execFile as execFileCallback, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import type { ImageResult } from "./types";

const execFile = promisify(execFileCallback);

export interface VideoFrameParams {
  /** 提取帧率;省略则提取每一帧 */
  fps?: number;
  /** 开始时间(秒) */
  start?: number;
  /** 结束时间(秒) */
  end?: number;
  /** 输出宽度 px,等比缩放 */
  width?: number;
  /** 缩放系数,与 width 二选一 */
  scale?: number;
  format?: "png" | "webp" | "jpeg";
  maxFrames?: number;
  /** 输出帧名前缀,默认用视频文件名 */
  name?: string;
}

interface VideoProbe {
  durationSeconds?: number;
  width?: number;
  height?: number;
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
};

/** Binary resolution order: env override → ffmpeg-static → PATH. */
function resolveFfmpeg(): string {
  return (
    process.env.IMAGE_MASTER_FFMPEG_PATH ||
    (ffmpegStatic as string | null) ||
    "ffmpeg"
  );
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveFfmpeg(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg 处理超时(${Math.round(timeoutMs / 1000)}s),视频可能过长或帧数过多`));
    }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 64 * 1024) {
        stderr = stderr.slice(-32 * 1024);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

/** `ffmpeg -i input` prints stream info to stderr and exits 1 — cheap, decodes nothing. */
async function probeVideo(input: string): Promise<VideoProbe> {
  const { stderr } = await runFfmpeg(["-hide_banner", "-i", input], 30_000);
  const probe: VideoProbe = {};

  const duration = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(stderr);
  if (duration) {
    probe.durationSeconds =
      Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  }

  const videoStream = /Video:.*?,\s*(\d{2,5})x(\d{2,5})/.exec(stderr);
  if (videoStream) {
    probe.width = Number(videoStream[1]);
    probe.height = Number(videoStream[2]);
  }

  return probe;
}

/** Even-numbered scale filter so yuv420-family codecs keep working. */
function scaleFilter(params: VideoFrameParams): string | null {
  if (params.width !== undefined) {
    return `scale=${params.width}:-2`;
  }
  if (params.scale !== undefined) {
    return `scale='trunc(iw*${params.scale}/2)*2':'trunc(ih*${params.scale}/2)*2'`;
  }
  return null;
}

function buildFfmpegArgs(
  input: string,
  outputPattern: string,
  params: VideoFrameParams
): string[] {
  const args = ["-hide_banner", "-nostdin", "-y"];

  // Seeking before -i is keyframe-fast yet frame-accurate on output with modern ffmpeg.
  if (params.start !== undefined) {
    args.push("-ss", String(params.start));
  }
  args.push("-i", input);
  if (params.end !== undefined) {
    const duration = params.end - (params.start ?? 0);
    if (duration <= 0) {
      throw new Error("end 必须大于 start");
    }
    args.push("-t", String(duration));
  }

  const filters: string[] = [];
  const fps = params.fps !== undefined ? `fps=${params.fps}` : null;
  if (fps) filters.push(fps);
  const scale = scaleFilter(params);
  if (scale) filters.push(scale);
  if (filters.length > 0) {
    args.push("-vf", filters.join(","));
  }

  args.push("-frames:v", String(params.maxFrames ?? 300));
  args.push("-start_number", "1");
  args.push("-fps_mode", "passthrough");
  args.push(outputPattern);
  return args;
}

/**
 * Extract frames from a video with ffmpeg into a temp dir and read them back as
 * ImageResults. GIF/WebM with alpha keep transparency in png/webp output.
 */
export async function extractVideoFrames(
  input: Buffer,
  params: VideoFrameParams,
  baseName: string
): Promise<ImageResult[]> {
  const format = params.format ?? "png";
  const prefix = params.name?.trim() || baseName;
  const tempDir = await mkdtemp(join(tmpdir(), "image-master-frames-"));
  const inputPath = join(tempDir, `input_${baseName}`);
  const outputPattern = join(tempDir, "frames", `${prefix}_%04d.${format}`);

  try {
    await mkdir(join(tempDir, "frames"));
    await writeFile(inputPath, input);

    const probe = await probeVideo(inputPath);
    const { code, stderr } = await runFfmpeg(
      buildFfmpegArgs(inputPath, outputPattern, params),
      300_000
    );

    if (code !== 0) {
      const tail = stderr.trim().split("\n").slice(-4).join("\n");
      throw new Error(`ffmpeg 抽帧失败(退出码 ${code}):${tail || "无错误输出"}`);
    }

    const files = (await readdir(join(tempDir, "frames"))).sort();
    if (files.length === 0) {
      throw new Error(
        "没有提取到任何帧:检查时间范围是否超出视频时长,或视频是否包含有效画面流"
      );
    }

    const buffers = await Promise.all(
      files.map((file) => readFile(join(tempDir, "frames", file)))
    );
    const firstMeta = await sharp(buffers[0]).metadata();

    const ext = format === "jpeg" ? "jpg" : format;
    const results: ImageResult[] = files.map((file, index) => ({
      name: file,
      buffer: buffers[index],
      contentType: EXT_CONTENT_TYPE[ext],
      ext,
      width: firstMeta.width,
      height: firstMeta.height,
      originalWidth: probe.width,
      originalHeight: probe.height,
    }));

    const metadata = {
      meta: {
        app: "image-master",
        version: "0.2.0",
        source: baseName,
        size: { w: firstMeta.width, h: firstMeta.height },
        scale: "1",
      },
      sourceDurationSeconds: probe.durationSeconds,
      startSeconds: params.start ?? 0,
      endSeconds: params.end ?? probe.durationSeconds,
      fps: params.fps ?? "source",
      count: files.length,
      format,
      truncated:
        params.maxFrames !== undefined && files.length >= params.maxFrames,
      frames: files.map((file, index) => ({ index, name: file })),
    };
    results.push({
      name: `${prefix}_frames.json`,
      buffer: Buffer.from(JSON.stringify(metadata, null, 2), "utf-8"),
      contentType: "application/json",
      ext: "json",
    });

    return results;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/** Used by tests to synthesise a fixture video without shipping binary assets. */
export async function renderTestVideo(
  outputPath: string,
  args: string[] = ["-f", "lavfi", "-i", "testsrc2=duration=1:size=64x64:rate=6", "-y"]
): Promise<void> {
  await execFile(resolveFfmpeg(), [...args, outputPath], { timeout: 60_000 });
}
