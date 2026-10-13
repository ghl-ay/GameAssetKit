import sharp from "sharp";
import type { RawImage } from "./types";

/** Decode any supported image into raw RGBA pixels. */
export async function decodeRaw(input: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(
      data.buffer,
      data.byteOffset,
      data.length
    ),
  };
}

/** Encode raw RGBA pixels as PNG. */
export function encodePng(img: RawImage): Promise<Buffer> {
  return sharp(rawToBuffer(img), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/** Encode raw RGBA pixels as lossless WebP. */
export function encodeWebp(img: RawImage): Promise<Buffer> {
  return sharp(rawToBuffer(img), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .webp({ lossless: true })
    .toBuffer();
}

function rawToBuffer(img: RawImage): Buffer {
  return Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
}

/** Allocate a fully transparent raw RGBA canvas. */
export function createRaw(width: number, height: number): RawImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Copy `src` into `dst` with its top-left corner at (dx, dy), clipping overflow. */
export function blit(
  src: RawImage,
  dst: RawImage,
  dx: number,
  dy: number
): void {
  const x0 = Math.max(0, dx);
  const x1 = Math.min(dst.width, dx + src.width);
  const y0 = Math.max(0, dy);
  const y1 = Math.min(dst.height, dy + src.height);
  if (x1 <= x0 || y1 <= y0) return;

  const run = (x1 - x0) * 4;
  for (let ty = y0; ty < y1; ty++) {
    const sy = ty - dy;
    const srcStart = (sy * src.width + (x0 - dx)) * 4;
    dst.data.set(src.data.subarray(srcStart, srcStart + run), (ty * dst.width + x0) * 4);
  }
}

/** Copy a sub-rectangle of `src` into a new image (clipped to the source bounds). */
export function extractRaw(
  src: RawImage,
  x: number,
  y: number,
  width: number,
  height: number
): RawImage {
  const out = createRaw(width, height);
  blit(src, out, -x, -y);
  return out;
}

/** Parse "#rgb" / "#rrggbb" into RGB components. */
export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid color: ${hex}`);
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}