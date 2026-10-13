import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { planSequence, resolveGrid, type SequenceFrame } from "./sequence";
import { runTool, type ToolInput } from "./registry";
import { decodeRaw } from "./image-io";
import type { ImageResult } from "./types";

interface FrameEntry {
  index: number;
  name: string;
  frame: { x: number; y: number; w: number; h: number };
  content: { x: number; y: number; w: number; h: number };
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

interface SequenceJson {
  meta: {
    image: string;
    size: { w: number; h: number };
    grid: {
      columns: number;
      rows: number;
      cellWidth: number;
      cellHeight: number;
      padding: number;
    };
    fps: number;
    count: number;
    anchor: string;
  };
  frames: FrameEntry[];
}

async function runMany(
  tool: string,
  inputs: ToolInput[],
  params: Record<string, unknown> = {},
  baseName = "sheet"
): Promise<ImageResult[]> {
  const result = await runTool(tool, inputs, params, baseName);
  if (!Array.isArray(result)) throw new Error("expected several outputs");
  return result;
}

async function runOne(
  tool: string,
  input: Buffer,
  params: Record<string, unknown> = {},
  baseName = "sheet"
): Promise<ImageResult[]> {
  const result = await runTool(tool, input, params, baseName);
  if (!Array.isArray(result)) throw new Error("expected several outputs");
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

/** A frame canvas with `rest` empty rows at the top and opaque content below. */
function frameWithFeet(w: number, height: number, contentHeight: number): Promise<Buffer> {
  const raw = solid(w, height, [0, 0, 0, 0]);
  for (let y = height - contentHeight; y < height; y++) {
    for (let x = 0; x < w; x++) raw.set([200, 40, 40, 255], (y * w + x) * 4);
  }
  return toPng(raw, w, height);
}

function pixelAt(
  img: { width: number; data: Uint8ClampedArray },
  x: number,
  y: number
): number[] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

describe("planSequence", () => {
  const box = (w: number, h: number) => ({ x: 0, y: 0, width: w, height: h });
  const frame = (name: string, w: number, h: number): SequenceFrame => ({
    name,
    sourceWidth: w,
    sourceHeight: h,
    box: box(w, h),
  });

  test("tiles identical frames on a square-ish grid", () => {
    const layout = planSequence(
      ["a", "b", "c", "d"].map((name) => frame(name, 4, 4)),
      { padding: 0, anchor: "center", powerOfTwo: false }
    );

    expect(layout.cellWidth).toBe(4);
    expect(layout.cellHeight).toBe(4);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.width).toBe(8);
    expect(layout.height).toBe(8);
    expect(layout.placements.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [4, 0],
      [0, 4],
      [4, 4],
    ]);
  });

  test("aligns frames of different heights on a shared anchor line", () => {
    const layout = planSequence(
      [frame("tall", 10, 10), frame("short", 10, 6)],
      { padding: 0, anchor: "bottom", powerOfTwo: false }
    );

    expect(layout.cellWidth).toBe(10);
    expect(layout.cellHeight).toBe(10);
    // The short frame is pushed down so both bottom edges line up.
    expect(layout.placements[0].y).toBe(0);
    expect(layout.placements[1].y).toBe(4);
    for (const placement of layout.placements) {
      expect(placement.y + placement.box.height).toBe(layout.cellHeight);
    }
  });

  test("honours columns, padding and power of two", () => {
    const layout = planSequence(
      ["a", "b", "c"].map((name) => frame(name, 3, 3)),
      { columns: 3, padding: 2, anchor: "center", powerOfTwo: true }
    );
    expect(layout.columns).toBe(3);
    expect(layout.rows).toBe(1);
    expect(layout.width).toBe(16); // 3*3 + 2*2 = 13 -> 16
    expect(layout.height).toBe(4); // 3 -> 4
    expect(layout.placements.map((p) => p.x)).toEqual([0, 5, 10]);
  });
});

describe("resolveGrid", () => {
  test("derives the cell size from columns, count and padding", () => {
    const grid = resolveGrid({
      columns: 2,
      count: 4,
      padding: 2,
      sheetWidth: 66,
      sheetHeight: 34,
    });
    expect(grid).toEqual({
      columns: 2,
      rows: 2,
      cellWidth: 32,
      cellHeight: 16,
      count: 4,
      padding: 2,
    });
  });

  test("accepts an explicit cell size for power-of-two sheets", () => {
    const grid = resolveGrid({
      columns: 2,
      rows: 2,
      cellWidth: 32,
      cellHeight: 32,
      padding: 2,
      sheetWidth: 128,
      sheetHeight: 128,
    });
    expect(grid.cellWidth).toBe(32);
    expect(grid.cellHeight).toBe(32);
    expect(grid.count).toBe(4);
  });

  test("uses count to trim a partially filled last row", () => {
    const grid = resolveGrid({
      columns: 4,
      count: 6,
      padding: 0,
      sheetWidth: 40,
      sheetHeight: 20,
    });
    expect(grid.rows).toBe(2);
    expect(grid.cellWidth).toBe(10);
    expect(grid.cellHeight).toBe(10);
    expect(grid.count).toBe(6);
  });

  test("rejects a grid that does not divide the sheet", () => {
    expect(() =>
      resolveGrid({ columns: 3, count: 3, padding: 0, sheetWidth: 100, sheetHeight: 32 })
    ).toThrow(/正整数/);
  });

  test("rejects a grid that overflows the sheet", () => {
    expect(() =>
      resolveGrid({
        columns: 4,
        rows: 4,
        cellWidth: 32,
        cellHeight: 32,
        padding: 2,
        sheetWidth: 128,
        sheetHeight: 128,
      })
    ).toThrow(/超出图片宽度/);
  });

  test("asks for a grid when given nothing", () => {
    expect(() =>
      resolveGrid({ padding: 0, sheetWidth: 64, sheetHeight: 64 })
    ).toThrow(/columns \/ rows \/ count/);
  });
});

describe("sequence-to-sheet", () => {
  test("packs frames into an aligned grid with metadata", async () => {
    const inputs: ToolInput[] = [
      { name: "walk_01.png", buffer: await frameWithFeet(10, 8, 8) },
      { name: "walk_02.png", buffer: await frameWithFeet(10, 8, 6) },
      { name: "walk_03.png", buffer: await frameWithFeet(10, 8, 4) },
      { name: "walk_04.png", buffer: await frameWithFeet(10, 8, 2) },
    ];

    const [image, meta] = await runMany(
      "sequence-to-sheet",
      inputs,
      { name: "walk", columns: 2, padding: 2, anchor: "bottom", fps: 24 },
      "walk"
    );
    expect(image.name).toBe("walk.png");
    expect(meta.name).toBe("walk.json");

    const json = JSON.parse(meta.buffer.toString("utf-8")) as SequenceJson;
    expect(json.meta.grid).toEqual({
      columns: 2,
      rows: 2,
      cellWidth: 10,
      cellHeight: 8,
      padding: 2,
    });
    expect(json.meta.fps).toBe(24);
    expect(json.meta.count).toBe(4);
    expect(json.meta.size).toEqual({ w: 22, h: 18 });
    expect(json.frames.map((f) => f.name)).toEqual([
      "walk_01.png",
      "walk_02.png",
      "walk_03.png",
      "walk_04.png",
    ]);

    // Every frame keeps its slot and sits on the shared bottom line.
    for (const entry of json.frames) {
      expect(entry.content.y + entry.content.h).toBe(json.meta.grid.cellHeight);
      expect(entry.sourceSize).toEqual({ w: 10, h: 8 });
    }
    expect(json.frames[3].content).toEqual({ x: 0, y: 6, w: 10, h: 2 });
    expect(json.frames[3].trimmed).toBe(true);

    const sheet = await decodeRaw(image.buffer);
    expect(sheet.width).toBe(22);
    expect(sheet.height).toBe(18);
    // Frame 4's two rows sit at the bottom of its cell, not at its top.
    expect(pixelAt(sheet, 12, 15)[3]).toBe(0);
    expect(pixelAt(sheet, 12, 17)[3]).toBe(255);
  });

  test("bleeds edge colours into the gaps", async () => {
    const inputs: ToolInput[] = [
      { name: "a.png", buffer: await frameWithFeet(4, 4, 4) },
      { name: "b.png", buffer: await frameWithFeet(4, 4, 4) },
    ];
    const [image] = await runMany("sequence-to-sheet", inputs, {
      columns: 2,
      padding: 4,
    });
    const sheet = await decodeRaw(image.buffer);
    // Every gap pixel carries the sprite colour: nothing is left as transparent black.
    for (let i = 0; i < sheet.width * sheet.height; i++) {
      expect([
        sheet.data[i * 4],
        sheet.data[i * 4 + 1],
        sheet.data[i * 4 + 2],
      ]).toEqual([200, 40, 40]);
    }
  });

  test("requires at least two frames", async () => {
    const inputs: ToolInput[] = [
      { name: "a.png", buffer: await frameWithFeet(4, 4, 4) },
    ];
    await expect(runMany("sequence-to-sheet", inputs)).rejects.toThrow(
      /至少需要 2 张/
    );
  });
});

describe("sheet-to-sequence", () => {
  async function buildSheet(): Promise<ImageResult[]> {
    const inputs: ToolInput[] = [
      { name: "walk_01.png", buffer: await frameWithFeet(8, 8, 8) },
      { name: "walk_02.png", buffer: await frameWithFeet(8, 8, 6) },
      { name: "walk_03.png", buffer: await frameWithFeet(8, 8, 4) },
      { name: "walk_04.png", buffer: await frameWithFeet(8, 8, 2) },
    ];
    return runMany(
      "sequence-to-sheet",
      inputs,
      { name: "walk", columns: 2, padding: 2, anchor: "bottom" },
      "walk"
    );
  }

  test("round-trips a sheet back into separate frames", async () => {
    const [sheet] = await buildSheet();
    const results = await runOne(
      "sheet-to-sequence",
      sheet.buffer,
      { columns: 2, count: 4, padding: 2, fps: 24 },
      "walk"
    );

    expect(results).toHaveLength(5);
    expect(results.map((file) => file.name)).toEqual([
      "walk_0001.png",
      "walk_0002.png",
      "walk_0003.png",
      "walk_0004.png",
      "walk.json",
    ]);
    for (const frame of results.slice(0, 4)) {
      expect(frame.width).toBe(8);
      expect(frame.height).toBe(8);
      expect(frame.originalWidth).toBe(8);
      expect(frame.originalHeight).toBe(8);
    }

    // The per-frame offsets survive the round trip.
    const json = JSON.parse(results[4].buffer.toString("utf-8")) as {
      meta: { fps: number; grid: { columns: number; rows: number } } ;
      frames: FrameEntry[];
    };
    expect(json.meta.fps).toBe(24);
    expect(json.meta.grid).toMatchObject({ columns: 2, rows: 2 });

    const third = await decodeRaw(results[2].buffer);
    expect(pixelAt(third, 0, 3)[3]).toBe(0);
    expect(pixelAt(third, 0, 7)[3]).toBe(255);
  });

  test("trims each frame when asked", async () => {
    const [sheet] = await buildSheet();
    const results = await runOne(
      "sheet-to-sequence",
      sheet.buffer,
      { columns: 2, count: 4, padding: 2, trim: true },
      "walk"
    );

    const sizes = results.slice(0, 4).map((frame) => [frame.width, frame.height]);
    expect(sizes).toEqual([
      [8, 8],
      [8, 6],
      [8, 4],
      [8, 2],
    ]);
  });

  test("slices a power-of-two sheet with an explicit cell size", async () => {
    const inputs: ToolInput[] = [
      { name: "a.png", buffer: await frameWithFeet(8, 8, 8) },
      { name: "b.png", buffer: await frameWithFeet(8, 8, 8) },
    ];
    const [sheet] = await runMany("sequence-to-sheet", inputs, {
      name: "pot",
      columns: 2,
      powerOfTwo: true,
    });
    // 16x8 of content rounded up to 16x8 -> already a power of two.
    expect(sheet.width).toBe(16);
    expect(sheet.height).toBe(8);

    const results = await runOne("sheet-to-sequence", sheet.buffer, {
      columns: 2,
      count: 2,
      cellWidth: 8,
      cellHeight: 8,
    });
    expect(results.slice(0, 2).map((frame) => [frame.width, frame.height])).toEqual([
      [8, 8],
      [8, 8],
    ]);
  });

  test("reports an impossible grid", async () => {
    const [sheet] = await buildSheet();
    await expect(
      runOne("sheet-to-sequence", sheet.buffer, { columns: 5, count: 10, padding: 0 })
    ).rejects.toThrow(/正整数/);
  });
});