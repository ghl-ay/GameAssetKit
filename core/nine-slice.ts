import type { RawImage } from "./types";

/** A nine-patch border: how many pixels each side keeps fixed. */
export interface NineSliceBorders {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The nine regions, in row-major order. */
export const NINE_SLICE_REGIONS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;

export type NineSliceRegion = (typeof NINE_SLICE_REGIONS)[number];

/** Short file-name suffix per region. */
export const REGION_SUFFIXES: Record<NineSliceRegion, string> = {
  "top-left": "tl",
  top: "t",
  "top-right": "tr",
  left: "l",
  center: "c",
  right: "r",
  "bottom-left": "bl",
  bottom: "b",
  "bottom-right": "br",
};

export interface NineSliceRegionBox {
  region: NineSliceRegion;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Split an image into the nine nine-patch regions. Corners stay fixed, edges
 * stretch along one axis and the center stretches along both.
 */
export function nineSliceRegions(
  width: number,
  height: number,
  borders: NineSliceBorders
): NineSliceRegionBox[] {
  const xs = [0, borders.left, width - borders.right];
  const ws = [borders.left, width - borders.left - borders.right, borders.right];
  const ys = [0, borders.top, height - borders.bottom];
  const hs = [borders.top, height - borders.top - borders.bottom, borders.bottom];

  const boxes: NineSliceRegionBox[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      boxes.push({
        region: NINE_SLICE_REGIONS[row * 3 + column],
        x: xs[column],
        y: ys[row],
        width: ws[column],
        height: hs[row],
      });
    }
  }
  return boxes;
}

/** True when two pixels are visually the same, within `maxDiff` per channel. */
function pixelsClose(
  data: Uint8ClampedArray,
  a: number,
  b: number,
  maxDiff: number
): boolean {
  const alphaA = data[a * 4 + 3];
  const alphaB = data[b * 4 + 3];
  // Fully transparent pixels are invisible whatever their RGB says.
  if (alphaA === 0 && alphaB === 0) return true;
  for (let channel = 0; channel < 4; channel++) {
    if (Math.abs(data[a * 4 + channel] - data[b * 4 + channel]) > maxDiff) {
      return false;
    }
  }
  return true;
}

/** First and last index of the run of similar pixels around `center`. */
function runAround(
  data: Uint8ClampedArray,
  length: number,
  center: number,
  indexAt: (i: number) => number,
  maxDiff: number
): { start: number; end: number } {
  const reference = indexAt(center);
  let start = center;
  while (start > 0 && pixelsClose(data, indexAt(start - 1), reference, maxDiff)) {
    start--;
  }
  let end = center;
  while (end < length - 1 && pixelsClose(data, indexAt(end + 1), reference, maxDiff)) {
    end++;
  }
  return { start, end };
}

/**
 * Guess the border insets from the flat interior of a nine-patch: the pixel in
 * the middle of the image is taken as the interior colour, and the run of
 * similar pixels around it along the middle row/column is the stretchable area.
 * Everything outside that run is the fixed border, so decorative rings end up in
 * the border instead of being stretched. Transparent runs along the outermost
 * row/column (rounded corners) are pulled into the border as well.
 *
 * `tolerance` (0-100) is how far a pixel may differ from the interior colour and
 * still count as interior. A gradient or textured interior needs explicit
 * left/right/top/bottom.
 */
export function detectBorders(img: RawImage, tolerance: number): NineSliceBorders {
  const { width, height, data } = img;
  const maxDiff = Math.round((tolerance / 100) * 255);
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  const at = (x: number, y: number) => y * width + x;

  const row = runAround(data, width, midX, (i) => at(i, midY), maxDiff);
  const column = runAround(data, height, midY, (i) => at(midX, i), maxDiff);

  // A rounded corner is transparent along the outer edge; that arc belongs to
  // the corner, never to the stretchable strip.
  const opaqueInterior = data[at(midX, midY) * 4 + 3] > 0;
  const transparentRun = (length: number, indexAt: (i: number) => number) => {
    if (!opaqueInterior) return 0;
    let count = 0;
    while (count < length && data[indexAt(count) * 4 + 3] === 0) count++;
    return count;
  };
  const topRow = (i: number) => at(i, 0);
  const bottomRow = (i: number) => at(i, height - 1);
  const leftColumn = (i: number) => at(0, i);
  const rightColumn = (i: number) => at(width - 1, i);
  return {
    left: Math.max(
      row.start,
      transparentRun(width, topRow),
      transparentRun(width, bottomRow)
    ),
    right: Math.max(
      width - 1 - row.end,
      transparentRun(width, (i) => topRow(width - 1 - i)),
      transparentRun(width, (i) => bottomRow(width - 1 - i))
    ),
    top: Math.max(
      column.start,
      transparentRun(height, leftColumn),
      transparentRun(height, rightColumn)
    ),
    bottom: Math.max(
      height - 1 - column.end,
      transparentRun(height, (i) => leftColumn(height - 1 - i)),
      transparentRun(height, (i) => rightColumn(height - 1 - i))
    ),
  };
}

export interface ResolvedBorders {
  borders: NineSliceBorders;
  /** Which sides were guessed instead of given. */
  detected: Record<keyof NineSliceBorders, boolean>;
}

/**
 * Fill in the sides that were not given and validate the result. The middle
 * region (and with it every stretchable part) has to keep a positive size.
 */
export function resolveBorders(
  img: RawImage,
  given: Partial<NineSliceBorders>,
  tolerance: number
): ResolvedBorders {
  const missing =
    given.left === undefined ||
    given.right === undefined ||
    given.top === undefined ||
    given.bottom === undefined;
  const guess = missing ? detectBorders(img, tolerance) : null;

  const borders: NineSliceBorders = {
    left: given.left ?? guess!.left,
    right: given.right ?? guess!.right,
    top: given.top ?? guess!.top,
    bottom: given.bottom ?? guess!.bottom,
  };
  const detected: Record<keyof NineSliceBorders, boolean> = {
    left: given.left === undefined,
    right: given.right === undefined,
    top: given.top === undefined,
    bottom: given.bottom === undefined,
  };

  if (borders.left + borders.right >= img.width) {
    throw new Error(
      `左右边框 ${borders.left}+${borders.right} 不小于图片宽度 ${img.width},没有可拉伸的中间区域`
    );
  }
  if (borders.top + borders.bottom >= img.height) {
    throw new Error(
      `上下边框 ${borders.top}+${borders.bottom} 不小于图片高度 ${img.height},没有可拉伸的中间区域`
    );
  }

  return { borders, detected };
}