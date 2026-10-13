import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { runTool } from "./registry";
import { decodeRaw } from "./image-io";
import type { ImageResult, RawImage } from "./types";

async function runOne(
  tool: string,
  input: Buffer,
  params: Record<string, unknown> = {},
  baseName = "a"
): Promise<ImageResult> {
  const result = await runTool(tool, input, params, baseName);
  if (Array.isArray(result)) throw new Error("expected a single output");
  return result;
}

function solid(w: number, h: number, rgba: [number, number, number, number]): Buffer {
  const raw = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) raw.set(rgba, i * 4);
  return raw;
}

function toPng(raw: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

function pixel(img: RawImage, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

/** 40x40 transparent canvas with a 10x10 opaque block whose top-left is (5, 6). */
function spriteWithMargin(): Promise<Buffer> {
  const raw = solid(40, 40, [0, 0, 0, 0]);
  for (let y = 6; y < 16; y++) {
    for (let x = 5; x < 15; x++) raw.set([10, 20, 30, 255], (y * 40 + x) * 4);
  }
  return toPng(raw, 40, 40);
}

describe("trim", () => {
  test("crops the transparent border down to the content", async () => {
    const out = await runOne("trim", await spriteWithMargin());
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
    expect(out.originalWidth).toBe(40);
    expect(out.originalHeight).toBe(40);
    expect(out.name).toBe("a_trim.png");

    const img = await decodeRaw(out.buffer);
    expect(pixel(img, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(pixel(img, 9, 9)).toEqual([10, 20, 30, 255]);
  });

  test("adds padding and anchors the content in the canvas", async () => {
    const out = await runOne("trim", await spriteWithMargin(), {
      padding: 3,
      anchor: "bottom-right",
    });
    expect(out.width).toBe(16);
    expect(out.height).toBe(16);

    const img = await decodeRaw(out.buffer);
    expect(pixel(img, 6, 6)).toEqual([10, 20, 30, 255]);
    expect(pixel(img, 5, 5)[3]).toBe(0);
  });

  test("squares and rounds the canvas up to a power of two", async () => {
    const raw = solid(10, 6, [1, 2, 3, 255]);
    const out = await runOne("trim", await toPng(raw, 10, 6), {
      square: true,
      powerOfTwo: true,
    });
    expect(out.width).toBe(16);
    expect(out.height).toBe(16);

    const img = await decodeRaw(out.buffer);
    expect(pixel(img, 3, 5)).toEqual([1, 2, 3, 255]);
    expect(pixel(img, 0, 0)[3]).toBe(0);
  });

  test("rejects a fully transparent image", async () => {
    const empty = await toPng(solid(8, 8, [0, 0, 0, 0]), 8, 8);
    await expect(runOne("trim", empty)).rejects.toThrow(/完全透明/);
  });

  test("threshold lets faint pixels be ignored", async () => {
    const raw = solid(6, 6, [255, 255, 255, 5]);
    raw.set([9, 9, 9, 255], (3 * 6 + 3) * 4);
    const out = await runOne("trim", await toPng(raw, 6, 6), { threshold: 10 });
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
  });
});

describe("alpha-bleed", () => {
  test("fills transparent neighbours with the sprite colour and keeps alpha", async () => {
    const raw = solid(11, 11, [0, 0, 0, 0]);
    raw.set([255, 0, 0, 255], (5 * 11 + 5) * 4);
    const out = await runOne("alpha-bleed", await toPng(raw, 11, 11), { radius: 4 });

    const img = await decodeRaw(out.buffer);
    expect(pixel(img, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(pixel(img, 1, 1)).toEqual([255, 0, 0, 0]);
    // Five pixels away in Chebyshev distance: untouched.
    expect(pixel(img, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  test("stops at the requested radius", async () => {
    const raw = solid(11, 11, [0, 0, 0, 0]);
    raw.set([0, 255, 0, 255], (5 * 11 + 5) * 4);
    const out = await runOne("alpha-bleed", await toPng(raw, 11, 11), { radius: 2 });

    const img = await decodeRaw(out.buffer);
    expect(pixel(img, 3, 3)).toEqual([0, 255, 0, 0]);
    expect(pixel(img, 2, 2)).toEqual([0, 0, 0, 0]);
  });

  test("unpremultiply recovers semi-transparent colour over black", async () => {
    const half = await toPng(solid(4, 4, [100, 50, 25, 128]), 4, 4);
    const out = await runOne("alpha-bleed", half, {
      radius: 1,
      unpremultiply: true,
    });
    const img = await decodeRaw(out.buffer);
    expect(pixel(img, 1, 1)).toEqual([199, 100, 50, 128]);
  });
});

describe("png-optimize", () => {
  const colours = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
    [0, 255, 255],
    [255, 0, 255],
    [0, 0, 0],
    [255, 255, 255],
  ];

  function eightColourSprite(): Promise<Buffer> {
    const size = 64;
    const raw = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const colour = colours[((x >> 3) + (y >> 3)) % colours.length];
        raw.set([...colour, 255], (y * size + x) * 4);
      }
    }
    return toPng(raw, size, size);
  }

  test("palette mode is much smaller than lossless on a low-colour sprite", async () => {
    const src = await eightColourSprite();
    const lossless = await runOne("png-optimize", src);
    const quantized = await runOne("png-optimize", src, {
      mode: "palette",
      colors: 8,
    });

    expect(lossless.width).toBe(64);
    expect(lossless.height).toBe(64);
    expect(lossless.originalWidth).toBe(64);
    expect(lossless.name).toBe("a_opt.png");
    expect(quantized.buffer.length).toBeLessThan(lossless.buffer.length);
    expect(quantized.contentType).toBe("image/png");
  });

  test("palette mode keeps the alpha channel", async () => {
    const raw = solid(32, 32, [200, 30, 30, 255]);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 16; x++) raw.set([0, 0, 0, 0], (y * 32 + x) * 4);
    }
    const out = await runOne("png-optimize", await toPng(raw, 32, 32), {
      mode: "palette",
      colors: 4,
    });
    const img = await decodeRaw(out.buffer);
    expect(pixel(img, 0, 0)[3]).toBe(0);
    expect(pixel(img, 31, 31)[3]).toBe(255);
  });
});