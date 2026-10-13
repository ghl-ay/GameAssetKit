import type { RawImage } from "./types";

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Colour bleed: fill the RGB of transparent pixels with the colour of the
 * nearest pixel that has alpha > 0, expanding up to `radius` pixels.
 *
 * Alpha is never touched, so the image still looks identical — but bilinear
 * filtering / mipmapping / texture atlases no longer pull transparent black
 * into the visible edge of a sprite.
 *
 * Returns the number of pixels whose colour was filled in.
 */
export function bleedTransparent(img: RawImage, radius: number): number {
  if (radius <= 0) return 0;

  const { width, height, data } = img;
  const total = width * height;
  const depth = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] > 0) {
      depth[i] = 0;
      queue[tail++] = i;
    }
  }

  let filled = 0;
  while (head < tail) {
    const index = queue[head++];
    const d = depth[index];
    if (d >= radius) continue;

    const x = index % width;
    const y = (index / width) | 0;
    const r = data[index * 4];
    const g = data[index * 4 + 1];
    const b = data[index * 4 + 2];

    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const next = ny * width + nx;
      if (depth[next] !== -1) continue;

      depth[next] = d + 1;
      data[next * 4] = r;
      data[next * 4 + 1] = g;
      data[next * 4 + 2] = b;
      filled++;
      queue[tail++] = next;
    }
  }

  return filled;
}

/**
 * Un-composite semi-transparent pixels that were flattened over black
 * (`c / a`). Only useful for sources that are actually premultiplied — the
 * usual AI cut-out fringing case. Fully opaque and fully transparent pixels
 * are left alone.
 */
export function unpremultiplyAlpha(img: RawImage): void {
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0 || a === 255) continue;
    const factor = 255 / a;
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.min(255, Math.round(data[i + c] * factor));
    }
  }
}