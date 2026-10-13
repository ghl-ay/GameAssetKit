import sharp from "sharp";
import { createRaw, decodeRaw } from "./image-io";
import type { RawImage } from "./types";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A single colour swap. */
export interface RgbPair {
  from: Rgb;
  to: Rgb;
}

export interface PaletteEntry {
  rgb: Rgb;
  count: number;
}

/** `#rrggbb` — the form used in every descriptor this module produces. */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Perceived brightness, used to order a palette the way an artist sees it. */
export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface PaletteHistogram {
  /** Distinct colours in first-seen (scan) order. */
  entries: PaletteEntry[];
  opaquePixels: number;
  transparentPixels: number;
  /** Pixels whose colour was too rare to track (only when the cap was hit). */
  overflow: number;
}

/**
 * Count the colours an image actually uses. Fully transparent pixels are skipped
 * — their RGB is invisible noise, and counting them would add phantom palette
 * entries.
 */
export function histogram(img: RawImage, maxTracked = 65536): PaletteHistogram {
  const counts = new Map<number, number>();
  const { data } = img;
  let opaquePixels = 0;
  let transparentPixels = 0;
  let overflow = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      transparentPixels++;
      continue;
    }
    opaquePixels++;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const seen = counts.get(key);
    if (seen !== undefined) counts.set(key, seen + 1);
    else if (counts.size < maxTracked) counts.set(key, 1);
    else overflow++;
  }

  const entries: PaletteEntry[] = [];
  for (const [key, count] of counts) {
    entries.push({
      rgb: { r: (key >> 16) & 0xff, g: (key >> 8) & 0xff, b: key & 0xff },
      count,
    });
  }

  return { entries, opaquePixels, transparentPixels, overflow };
}

export type PaletteOrder = "luminance" | "frequency" | "first";

/** Reorder a palette; `first` keeps the order the colours appear in the image. */
export function orderPalette(
  entries: PaletteEntry[],
  order: PaletteOrder
): PaletteEntry[] {
  if (order === "first") return [...entries];
  const sorted = [...entries];
  if (order === "frequency") {
    sorted.sort((a, b) => b.count - a.count || luminance(a.rgb) - luminance(b.rgb));
  } else {
    sorted.sort((a, b) => luminance(a.rgb) - luminance(b.rgb) || b.count - a.count);
  }
  return sorted;
}

/**
 * Quantise an image to at most `colours` colours with libimagequant (the same
 * engine `png-optimize` uses) and report the palette it chose. Dithering is off
 * so every output pixel really is one of the reported colours.
 */
export async function quantizePalette(
  input: Buffer,
  colours: number
): Promise<PaletteEntry[]> {
  const quantised = await sharp(input)
    .png({ palette: true, colours, dither: 0, effort: 7 })
    .toBuffer();
  const { entries } = histogram(await decodeRaw(quantised));
  return orderPalette(entries, "frequency");
}

export interface ApplyResult {
  replacedPixels: number;
  /** How many pixels each pair replaced, indexed like `pairs`. */
  matched: number[];
}

/**
 * Swap colours in place. Alpha is never touched, and every pixel is decided from
 * its original value, so `A→B` and `B→C` cannot chain into `A→C`.
 */
export function applyPaletteMap(
  img: RawImage,
  pairs: RgbPair[],
  tolerance: number
): ApplyResult {
  const { data } = img;
  const matched = new Array<number>(pairs.length).fill(0);
  let replacedPixels = 0;

  if (tolerance === 0) {
    // Exact matching: same key as the histogram, first pair wins.
    const lookup = new Map<number, { to: Rgb; index: number }>();
    pairs.forEach((pair, index) => {
      const key = (pair.from.r << 16) | (pair.from.g << 8) | pair.from.b;
      if (!lookup.has(key)) lookup.set(key, { to: pair.to, index });
    });
    for (let i = 0; i < data.length; i += 4) {
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const hit = lookup.get(key);
      if (!hit) continue;
      data[i] = hit.to.r;
      data[i + 1] = hit.to.g;
      data[i + 2] = hit.to.b;
      matched[hit.index]++;
      replacedPixels++;
    }
    return { replacedPixels, matched };
  }

  const maxDiff = Math.round((tolerance / 100) * 255);
  for (let i = 0; i < data.length; i += 4) {
    for (let p = 0; p < pairs.length; p++) {
      const { from, to } = pairs[p];
      if (
        Math.abs(data[i] - from.r) <= maxDiff &&
        Math.abs(data[i + 1] - from.g) <= maxDiff &&
        Math.abs(data[i + 2] - from.b) <= maxDiff
      ) {
        data[i] = to.r;
        data[i + 1] = to.g;
        data[i + 2] = to.b;
        matched[p]++;
        replacedPixels++;
        break;
      }
    }
  }
  return { replacedPixels, matched };
}

/** A grid of colour blocks, so a palette can be looked at instead of read. */
export function paletteSwatch(
  entries: PaletteEntry[],
  block = 16,
  gap = 2
): RawImage {
  const columns = Math.max(1, Math.ceil(Math.sqrt(entries.length || 1)));
  const rows = Math.max(1, Math.ceil(entries.length / columns));
  const width = columns * block + (columns - 1) * gap;
  const height = rows * block + (rows - 1) * gap;
  const canvas = createRaw(width, height);

  entries.forEach((entry, index) => {
    const x = (index % columns) * (block + gap);
    const y = Math.floor(index / columns) * (block + gap);
    for (let dy = 0; dy < block; dy++) {
      for (let dx = 0; dx < block; dx++) {
        const offset = ((y + dy) * width + x + dx) * 4;
        canvas.data[offset] = entry.rgb.r;
        canvas.data[offset + 1] = entry.rgb.g;
        canvas.data[offset + 2] = entry.rgb.b;
        canvas.data[offset + 3] = 255;
      }
    }
  });

  return canvas;
}