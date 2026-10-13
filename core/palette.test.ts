import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  applyPaletteMap,
  histogram,
  orderPalette,
  paletteSwatch,
  rgbToHex,
} from "./palette";
import { runTool } from "./registry";
import { decodeRaw } from "./image-io";
import type { ImageResult, RawImage } from "./types";

type Rgba = [number, number, number, number];

interface SwapJson {
  meta: { source: string };
  mode: string;
  order?: string;
  tolerance: number;
  mapping: Array<{ from: string; to: string; matched: number }>;
  replacedPixels: number;
  warnings: string[];
}

interface ExtractJson {
  palette: Array<{ hex: string; r: number; g: number; b: number; count: number; share: number }>;
  distinct: number;
  limit: number;
  quantized: boolean;
  truncated: boolean;
  opaquePixels: number;
  transparentPixels: number;
  warnings: string[];
}

const RED: Rgba = [255, 0, 0, 255];
const GREEN: Rgba = [0, 255, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

async function png(rows: Rgba[][]): Promise<Buffer> {
  const height = rows.length;
  const width = rows[0].length;
  const raw = Buffer.alloc(width * height * 4);
  rows.forEach((row, y) => {
    row.forEach((rgba, x) => raw.set(rgba, (y * width + x) * 4));
  });
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function pixelAt(img: RawImage, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

async function runAll(
  tool: string,
  input: Buffer,
  params: Record<string, unknown> = {},
  baseName = "sprite"
): Promise<ImageResult[]> {
  const result = await runTool(tool, input, params, baseName);
  if (!Array.isArray(result)) throw new Error("expected several outputs");
  return result;
}

/** red, blue and green plus one transparent pixel. */
const SPRITE: Rgba[][] = [
  [RED, RED, BLUE],
  [GREEN, CLEAR, BLUE],
];

describe("histogram", () => {
  test("counts opaque colours in first-seen order and skips transparent pixels", async () => {
    const stats = histogram(await decodeRaw(await png(SPRITE)));
    expect(stats.opaquePixels).toBe(5);
    expect(stats.transparentPixels).toBe(1);
    expect(stats.overflow).toBe(0);
    expect(stats.entries.map((entry) => [rgbToHex(entry.rgb), entry.count])).toEqual([
      ["#ff0000", 2],
      ["#0000ff", 2],
      ["#00ff00", 1],
    ]);
  });
});

describe("orderPalette", () => {
  test("sorts by frequency, luminance or first appearance", async () => {
    const entries = histogram(await decodeRaw(await png(SPRITE))).entries;
    const hexes = (order: "luminance" | "frequency" | "first") =>
      orderPalette(entries, order).map((entry) => rgbToHex(entry.rgb));

    expect(hexes("frequency")).toEqual(["#0000ff", "#ff0000", "#00ff00"]);
    expect(hexes("luminance")).toEqual(["#0000ff", "#ff0000", "#00ff00"]);
    expect(hexes("first")).toEqual(["#ff0000", "#0000ff", "#00ff00"]);
  });

  test("breaks frequency ties by luminance", async () => {
    // Same count, so the darker colour has to come first.
    const entries = [
      { rgb: { r: 255, g: 255, b: 255 }, count: 5 },
      { rgb: { r: 10, g: 10, b: 10 }, count: 5 },
    ];
    expect(orderPalette(entries, "frequency").map((entry) => rgbToHex(entry.rgb))).toEqual([
      "#0a0a0a",
      "#ffffff",
    ]);
  });
});

describe("applyPaletteMap", () => {
  test("swaps colours without chaining and keeps alpha", async () => {
    const img = await decodeRaw(await png(SPRITE));
    const pairs = [
      { from: { r: 255, g: 0, b: 0 }, to: { r: 0, g: 0, b: 255 } },
      { from: { r: 0, g: 0, b: 255 }, to: { r: 0, g: 255, b: 0 } },
    ];
    const result = applyPaletteMap(img, pairs, 0);

    expect(result.replacedPixels).toBe(4);
    expect(result.matched).toEqual([2, 2]);
    // Row 0 is red, red, blue — red becomes blue, and the blue that was already
    // there becomes green instead of chaining red -> blue -> green.
    expect(pixelAt(img, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(img, 1, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(img, 2, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(img, 2, 1)).toEqual([0, 255, 0, 255]);
    // Unmapped and transparent pixels stay as they are.
    expect(pixelAt(img, 0, 1)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(img, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  test("tolerance widens the match", async () => {
    const near: Rgba[][] = [[[250, 6, 6, 255]]];
    const pairs = [{ from: { r: 255, g: 0, b: 0 }, to: { r: 0, g: 0, b: 255 } }];

    const exact = await decodeRaw(await png(near));
    expect(applyPaletteMap(exact, pairs, 0).replacedPixels).toBe(0);
    expect(pixelAt(exact, 0, 0)).toEqual([250, 6, 6, 255]);

    const loose = await decodeRaw(await png(near));
    expect(applyPaletteMap(loose, pairs, 8).replacedPixels).toBe(1);
    expect(pixelAt(loose, 0, 0)).toEqual([0, 0, 255, 255]);
  });
});

describe("paletteSwatch", () => {
  test("draws one block per colour with transparent gaps", () => {
    const entries = [
      { rgb: { r: 255, g: 0, b: 0 }, count: 1 },
      { rgb: { r: 0, g: 255, b: 0 }, count: 1 },
      { rgb: { r: 0, g: 0, b: 255 }, count: 1 },
      { rgb: { r: 255, g: 255, b: 255 }, count: 1 },
    ];
    const swatch = paletteSwatch(entries, 8, 2);
    expect([swatch.width, swatch.height]).toEqual([18, 18]);
    expect(pixelAt(swatch, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(swatch, 10, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(swatch, 0, 10)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(swatch, 10, 10)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(swatch, 8, 0)[3]).toBe(0);
    expect(pixelAt(swatch, 0, 8)[3]).toBe(0);
  });
});

describe("palette-swap", () => {
  test("replaces the mapped colours and reports what happened", async () => {
    const results = await runAll(
      "palette-swap",
      await png(SPRITE),
      { map: [{ from: "#ff0000", to: "#0000ff" }] },
      "sprite"
    );
    expect(results.map((file) => file.name)).toEqual([
      "sprite_swapped.png",
      "sprite_swap.json",
    ]);

    const swapped = await decodeRaw(results[0].buffer);
    expect(pixelAt(swapped, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(swapped, 1, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(swapped, 0, 1)).toEqual([0, 255, 0, 255]);

    const json = JSON.parse(results[1].buffer.toString("utf-8")) as SwapJson;
    expect(json.mode).toBe("map");
    expect(json.tolerance).toBe(0);
    expect(json.mapping).toEqual([{ from: "#ff0000", to: "#0000ff", matched: 2 }]);
    expect(json.replacedPixels).toBe(2);
    expect(json.warnings).toEqual([]);
  });

  test("warns about mappings that matched nothing", async () => {
    const results = await runAll("palette-swap", await png(SPRITE), {
      map: [
        { from: "#ff0000", to: "#0000ff" },
        { from: "#123456", to: "#654321" },
      ],
    });
    const json = JSON.parse(results[1].buffer.toString("utf-8")) as SwapJson;
    expect(json.warnings).toHaveLength(1);
    expect(json.warnings[0]).toContain("#123456");
  });

  test("maps the whole palette in luminance order", async () => {
    const results = await runAll(
      "palette-swap",
      await png(SPRITE),
      { palette: ["#111111", "#222222", "#333333"] },
      "sprite"
    );
    const swapped = await decodeRaw(results[0].buffer);
    // Luminance order is blue, red, green: the blue pixel takes the first slot.
    expect(pixelAt(swapped, 2, 0)).toEqual([0x11, 0x11, 0x11, 255]);
    expect(pixelAt(swapped, 0, 0)).toEqual([0x22, 0x22, 0x22, 255]);
    expect(pixelAt(swapped, 0, 1)).toEqual([0x33, 0x33, 0x33, 255]);

    const json = JSON.parse(results[1].buffer.toString("utf-8")) as SwapJson;
    expect(json.mode).toBe("palette");
    expect(json.order).toBe("luminance");
    expect(json.mapping.map((pair) => pair.from)).toEqual([
      "#0000ff",
      "#ff0000",
      "#00ff00",
    ]);
  });

  test("honours the first-appearance order", async () => {
    const results = await runAll(
      "palette-swap",
      await png(SPRITE),
      { palette: ["#111111", "#222222", "#333333"], order: "first" },
      "sprite"
    );
    const json = JSON.parse(results[1].buffer.toString("utf-8")) as SwapJson;
    expect(json.mapping.map((pair) => pair.from)).toEqual([
      "#ff0000",
      "#0000ff",
      "#00ff00",
    ]);
  });

  test("rejects a target palette that is too short", async () => {
    await expect(
      runAll("palette-swap", await png(SPRITE), { palette: ["#111111"] })
    ).rejects.toThrow(/源图有 3 种颜色/);
  });

  test("needs exactly one of map or palette", async () => {
    const input = await png(SPRITE);
    await expect(runAll("palette-swap", input)).rejects.toThrow(/map 或 palette/);
    await expect(
      runAll("palette-swap", input, {
        map: [{ from: "#ff0000", to: "#0000ff" }],
        palette: ["#111111"],
      })
    ).rejects.toThrow(/只能给一个/);
  });
});

describe("palette-extract", () => {
  test("reports the palette by frequency with shares", async () => {
    const results = await runAll("palette-extract", await png(SPRITE), {}, "sprite");
    expect(results.map((file) => file.name)).toEqual([
      "sprite_palette.png",
      "sprite_palette.json",
    ]);

    const json = JSON.parse(results[1].buffer.toString("utf-8")) as ExtractJson;
    expect(json.palette.map((entry) => entry.hex)).toEqual([
      "#0000ff",
      "#ff0000",
      "#00ff00",
    ]);
    expect(json.palette[0]).toMatchObject({ count: 2, share: 0.4 });
    expect(json.distinct).toBe(3);
    expect(json.quantized).toBe(false);
    expect(json.truncated).toBe(false);
    expect(json.opaquePixels).toBe(5);
    expect(json.transparentPixels).toBe(1);
    expect(json.warnings).toEqual([]);

    // The swatch holds one block per colour.
    const swatch = await decodeRaw(results[0].buffer);
    expect(pixelAt(swatch, 4, 4)).toEqual([0, 0, 255, 255]);
  });

  test("quantises down to the requested colour count", async () => {
    const results = await runAll(
      "palette-extract",
      await png(SPRITE),
      { colors: 2, quantize: true },
      "sprite"
    );
    const json = JSON.parse(results[1].buffer.toString("utf-8")) as ExtractJson;
    expect(json.palette).toHaveLength(2);
    expect(json.quantized).toBe(true);
    expect(json.truncated).toBe(false);
    expect(json.distinct).toBe(3);
  });

  test("falls back to the most frequent colours", async () => {
    const results = await runAll(
      "palette-extract",
      await png(SPRITE),
      { colors: 2, quantize: false },
      "sprite"
    );
    const json = JSON.parse(results[1].buffer.toString("utf-8")) as ExtractJson;
    expect(json.palette.map((entry) => entry.hex)).toEqual(["#0000ff", "#ff0000"]);
    expect(json.quantized).toBe(false);
    expect(json.truncated).toBe(true);
    expect(json.warnings[0]).toContain("出现频率");
  });

  test("can skip the swatch image", async () => {
    const results = await runAll(
      "palette-extract",
      await png(SPRITE),
      { swatch: false },
      "sprite"
    );
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("sprite_palette.json");
  });
});