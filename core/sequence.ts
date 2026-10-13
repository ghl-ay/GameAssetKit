import { anchorFraction, type Anchor } from "./anchor";
import { nextPowerOfTwo, type ContentBox } from "./trim";

export interface SequenceFrame {
  /** Source file name. */
  name: string;
  /** Size of the source canvas the frame was drawn on. */
  sourceWidth: number;
  sourceHeight: number;
  /** Visible content box inside the source canvas. */
  box: ContentBox;
}

export interface SequencePlacement {
  name: string;
  /** Grid position of the frame. */
  column: number;
  row: number;
  /** Top-left of the frame content inside the sheet. */
  x: number;
  y: number;
  box: ContentBox;
  sourceWidth: number;
  sourceHeight: number;
}

export interface SequenceLayout {
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  padding: number;
  /** Sheet size, power-of-two rounded when requested. */
  width: number;
  height: number;
  placements: SequencePlacement[];
}

export interface SequenceOptions {
  /** Grid columns; omitted means "as square as possible". */
  columns?: number;
  padding: number;
  anchor: Anchor;
  powerOfTwo: boolean;
}

interface Margins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Lay animation frames out on a uniform grid so every frame's anchor point lands
 * on the same spot inside its cell. That is what keeps a hand-drawn or
 * AI-generated sequence from jittering: frames with different content bounds end
 * up aligned to a shared ground line instead of a shared canvas corner.
 */
export function planSequence(
  frames: SequenceFrame[],
  options: SequenceOptions
): SequenceLayout {
  if (frames.length === 0) throw new Error("sequence needs at least one frame");

  const { fx, fy } = anchorFraction(options.anchor);
  const margins: Margins[] = frames.map((frame) => {
    // Integer anchor point inside the frame's own content box.
    const ax = frame.box.x + Math.round(fx * frame.box.width);
    const ay = frame.box.y + Math.round(fy * frame.box.height);
    return {
      left: ax - frame.box.x,
      right: frame.box.x + frame.box.width - ax,
      top: ay - frame.box.y,
      bottom: frame.box.y + frame.box.height - ay,
    };
  });

  const cellWidth = Math.max(...margins.map((m) => m.left + m.right));
  const cellHeight = Math.max(...margins.map((m) => m.top + m.bottom));
  const unionLeft = Math.max(...margins.map((m) => m.left));
  const unionTop = Math.max(...margins.map((m) => m.top));

  const columns = options.columns ?? Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);
  const { padding } = options;

  const placements = frames.map((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      name: frame.name,
      column,
      row,
      x: column * (cellWidth + padding) + (unionLeft - margins[index].left),
      y: row * (cellHeight + padding) + (unionTop - margins[index].top),
      box: frame.box,
      sourceWidth: frame.sourceWidth,
      sourceHeight: frame.sourceHeight,
    };
  });

  const sheetWidth = columns * cellWidth + (columns - 1) * padding;
  const sheetHeight = rows * cellHeight + (rows - 1) * padding;

  return {
    cellWidth,
    cellHeight,
    columns,
    rows,
    padding,
    width: options.powerOfTwo ? nextPowerOfTwo(sheetWidth) : sheetWidth,
    height: options.powerOfTwo ? nextPowerOfTwo(sheetHeight) : sheetHeight,
    placements,
  };
}

export interface GridRequest {
  columns?: number;
  rows?: number;
  count?: number;
  cellWidth?: number;
  cellHeight?: number;
  padding: number;
  sheetWidth: number;
  sheetHeight: number;
}

export interface Grid {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  /** Number of frames to extract (<= columns * rows). */
  count: number;
  padding: number;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} 计算结果为 ${value},不是正整数 — 检查 columns/rows/padding 是否与图片尺寸匹配`);
  }
  return value;
}

/**
 * Work out the grid of a spritesheet from the cell count (columns/rows/count).
 * `cellWidth`/`cellHeight` only override the cell size — needed when the sheet
 * was rounded up to a power of two, because then the sheet size alone no longer
 * tells you how wide a cell is.
 */
export function resolveGrid(request: GridRequest): Grid {
  const { padding, sheetWidth, sheetHeight } = request;
  if (sheetWidth <= 0 || sheetHeight <= 0) throw new Error("图片尺寸无效");

  const total =
    request.count ??
    (request.columns && request.rows
      ? request.columns * request.rows
      : undefined);

  let columns = request.columns;
  let rows = request.rows;

  if (columns === undefined || rows === undefined) {
    if (total === undefined) {
      throw new Error(
        "需要提供 columns / rows / count 之一(cellWidth / cellHeight 只用于覆盖单元格尺寸)"
      );
    }
    columns = columns ?? Math.ceil(Math.sqrt(total));
    rows = rows ?? Math.ceil(total / columns);
  }

  const cellWidth =
    request.cellWidth ??
    positiveInteger((sheetWidth - (columns - 1) * padding) / columns, "单元格宽度");
  const cellHeight =
    request.cellHeight ??
    positiveInteger((sheetHeight - (rows - 1) * padding) / rows, "单元格高度");

  if (columns * cellWidth + (columns - 1) * padding > sheetWidth) {
    throw new Error(
      `网格宽度 ${columns}x${cellWidth}(+${padding} 间距)超出图片宽度 ${sheetWidth}`
    );
  }
  if (rows * cellHeight + (rows - 1) * padding > sheetHeight) {
    throw new Error(
      `网格高度 ${rows}x${cellHeight}(+${padding} 间距)超出图片高度 ${sheetHeight}`
    );
  }

  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    count: Math.min(total ?? columns * rows, columns * rows),
    padding,
  };
}