/**
 * Texture atlas packing.
 *
 * MaxRects with the Best-Short-Side-Fit heuristic, which is the classic
 * spritesheet packer (same family as TexturePacker's "MaxRects" and
 * rectangle-pack). Free rectangles are split on every placement and pruned of
 * contained leftovers.
 */

export interface AtlasItem {
  /** Unique frame key, e.g. "hero.png" */
  name: string;
  width: number;
  height: number;
}

export interface AtlasPlacement {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasOptions {
  /** Transparent gap enforced between frames, in pixels. */
  padding: number;
  maxWidth: number;
  maxHeight: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  placements: AtlasPlacement[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function contains(a: Rect, b: Rect): boolean {
  return a.x <= b.x && a.y <= b.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Drop empty and fully contained free rectangles (keeps one of each duplicate). */
function prune(free: Rect[]): Rect[] {
  const kept: Rect[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < free.length; i++) {
    const a = free[i];
    if (a.w <= 0 || a.h <= 0) continue;
    const key = `${a.x},${a.y},${a.w},${a.h}`;
    if (seen.has(key)) continue;

    let contained = false;
    for (let j = 0; j < free.length; j++) {
      if (i === j) continue;
      const b = free[j];
      if (b.w <= 0 || b.h <= 0) continue;
      // Identical rectangles: only the first one survives.
      if (contains(b, a) && !(sameRect(a, b) && j > i)) {
        contained = true;
        break;
      }
    }
    if (contained) continue;
    seen.add(key);
    kept.push(a);
  }
  return kept;
}

/** Try to pack every item into a fixed bin. Returns null when it does not fit. */
function tryPack(
  items: AtlasItem[],
  binWidth: number,
  binHeight: number,
  padding: number
): AtlasPlacement[] | null {
  const sorted = [...items].sort(
    (a, b) =>
      b.height - a.height || b.width - a.width || a.name.localeCompare(b.name)
  );

  let free: Rect[] = [{ x: 0, y: 0, w: binWidth, h: binHeight }];
  const placements: AtlasPlacement[] = [];

  for (const item of sorted) {
    const iw = item.width + padding;
    const ih = item.height + padding;
    if (iw > binWidth || ih > binHeight) return null;

    let bestIndex = -1;
    let bestShort = Number.POSITIVE_INFINITY;
    let bestLong = Number.POSITIVE_INFINITY;

    for (let i = 0; i < free.length; i++) {
      const f = free[i];
      if (f.w < iw || f.h < ih) continue;
      const leftoverW = f.w - iw;
      const leftoverH = f.h - ih;
      const short = Math.min(leftoverW, leftoverH);
      const long = Math.max(leftoverW, leftoverH);
      if (short < bestShort || (short === bestShort && long < bestLong)) {
        bestIndex = i;
        bestShort = short;
        bestLong = long;
      }
    }

    if (bestIndex === -1) return null;

    const target = free[bestIndex];
    const used: Rect = { x: target.x, y: target.y, w: iw, h: ih };

    const next: Rect[] = [];
    for (let i = 0; i < free.length; i++) {
      const f = free[i];
      if (!intersects(f, used)) {
        next.push(f);
        continue;
      }
      if (used.x > f.x) next.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
      if (used.x + used.w < f.x + f.w) {
        next.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - (used.x + used.w), h: f.h });
      }
      if (used.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
      if (used.y + used.h < f.y + f.h) {
        next.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - (used.y + used.h) });
      }
    }
    free = prune(next);

    placements.push({
      name: item.name,
      x: used.x,
      y: used.y,
      width: item.width,
      height: item.height,
    });
  }

  return placements;
}

/** Power-of-two sizes from `min` up to `max`, always including `max` itself. */
function sizeCandidates(min: number, max: number): number[] {
  const out: number[] = [];
  let p = 1;
  while (p < min) p *= 2;
  while (p <= max) {
    out.push(p);
    p *= 2;
  }
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

/**
 * Pack items as tightly as possible. The returned layout is cropped to the
 * bounding box of the placed frames, so `width`/`height` are the real atlas
 * size (round to a power of two afterwards if the target engine needs it).
 */
export function packAtlas(items: AtlasItem[], options: AtlasOptions): AtlasLayout {
  if (items.length === 0) throw new Error("atlas needs at least one image");

  const { padding } = options;
  const widest = Math.max(...items.map((i) => i.width + padding));
  const tallest = Math.max(...items.map((i) => i.height + padding));
  if (widest > options.maxWidth || tallest > options.maxHeight) {
    const offender = items.find(
      (i) => i.width + padding > options.maxWidth || i.height + padding > options.maxHeight
    );
    throw new Error(
      `"${offender?.name}" 加上 padding 后为 ${offender!.width + padding}×${
        offender!.height + padding
      },超出图集上限 ${options.maxWidth}×${options.maxHeight}`
    );
  }

  const area = items.reduce((sum, i) => sum + (i.width + padding) * (i.height + padding), 0);
  const bins: Array<{ w: number; h: number }> = [];
  for (const w of sizeCandidates(widest, options.maxWidth)) {
    for (const h of sizeCandidates(tallest, options.maxHeight)) {
      if (w * h >= area) bins.push({ w, h });
    }
  }
  bins.sort(
    (a, b) =>
      a.w * a.h - b.w * b.h || Math.abs(a.w - a.h) - Math.abs(b.w - b.h)
  );

  for (const bin of bins) {
    const placements = tryPack(items, bin.w, bin.h, padding);
    if (!placements) continue;
    const usedWidth = Math.max(...placements.map((p) => p.x + p.width));
    const usedHeight = Math.max(...placements.map((p) => p.y + p.height));
    return { width: usedWidth, height: usedHeight, placements };
  }

  throw new Error(
    `无法在 ${options.maxWidth}×${options.maxHeight} 内放下 ${items.length} 张图(至少需要 ${area} 像素)`
  );
}