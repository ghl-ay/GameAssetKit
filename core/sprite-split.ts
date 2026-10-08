import type { RawImage } from "./types";

export interface SpriteBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function isTransparent(data: Uint8ClampedArray, pixelIndex: number): boolean {
  return data[pixelIndex * 4 + 3] === 0;
}

/**
 * Ported from app/lib/sprite-splitter.ts: 8-connected flood fill over
 * non-transparent pixels.
 */
function floodFill(
  data: Uint8ClampedArray,
  labels: Int32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  label: number
): void {
  const stack: [number, number][] = [[startX, startY]];
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const idx = y * width + x;

    if (
      x < 0 ||
      x >= width ||
      y < 0 ||
      y >= height ||
      labels[idx] !== 0 ||
      isTransparent(data, idx)
    ) {
      continue;
    }

    labels[idx] = label;

    for (const [dx, dy] of directions) {
      stack.push([x + dx, y + dy]);
    }
  }
}

/**
 * Find sprite bounding boxes by connected-component labeling on the alpha
 * channel. Same ordering as the web tool: rows of ~50px top-to-bottom,
 * then left-to-right.
 */
export function findSpriteBoxes(img: RawImage): SpriteBox[] {
  const { width, height, data } = img;

  const labels = new Int32Array(width * height);
  let currentLabel = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (labels[idx] === 0 && !isTransparent(data, idx)) {
        currentLabel++;
        floodFill(data, labels, width, height, x, y, currentLabel);
      }
    }
  }

  if (currentLabel === 0) {
    return [];
  }

  const boxes: Map<number, BoundingBox> = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (label > 0) {
        const box = boxes.get(label) || {
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
        };
        box.minX = Math.min(box.minX, x);
        box.minY = Math.min(box.minY, y);
        box.maxX = Math.max(box.maxX, x);
        box.maxY = Math.max(box.maxY, y);
        boxes.set(label, box);
      }
    }
  }

  const sortedBoxes = Array.from(boxes.values()).sort((a, b) => {
    const rowDiff = Math.floor(a.minY / 50) - Math.floor(b.minY / 50);
    if (rowDiff !== 0) return rowDiff;
    return a.minX - b.minX;
  });

  return sortedBoxes.map((box) => ({
    x: box.minX,
    y: box.minY,
    width: box.maxX - box.minX + 1,
    height: box.maxY - box.minY + 1,
  }));
}

/**
 * Uniform grid splitting, same as splitSpritesGrid in the web tool.
 */
export function gridSpriteBoxes(
  width: number,
  height: number,
  columns: number,
  rows: number
): SpriteBox[] {
  if (columns < 1 || rows < 1) return [];

  const cellWidth = Math.floor(width / columns);
  const cellHeight = Math.floor(height / rows);
  const boxes: SpriteBox[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = col * cellWidth;
      const y = row * cellHeight;
      const w = col === columns - 1 ? width - x : cellWidth;
      const h = row === rows - 1 ? height - y : cellHeight;
      boxes.push({ x, y, width: w, height: h });
    }
  }

  return boxes;
}
