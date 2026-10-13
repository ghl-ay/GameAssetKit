import type { RawImage } from "./types";

export interface ContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of every pixel whose alpha is greater than `threshold`.
 * Returns null when the image is (effectively) fully transparent.
 */
export function contentBox(img: RawImage, threshold = 0): ContentBox | null {
  const { width, height, data } = img;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Smallest power of two that is >= n (1 for n <= 1). */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}