import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  detectBorders,
  nineSliceRegions,
  resolveBorders,
} from "./nine-slice";
import { runTool } from "./registry";
import { decodeRaw } from "./image-io";
import type { ImageResult, RawImage } from "./types";

interface NineSliceJson {
  meta: { source: string; size: { w: number; h: number } };
  borders: { left: number; right: number; top: number; bottom: number };
  detected: { left: boolean; right: boolean; top: boolean; bottom: boolean };
  minimumSize: { w: number; h: number };
  regions: Record<string, { x: number; y: number; w: number; h: number }>;
  slices: Record<string, string>;
}

async function runAll(
  tool: string,
  input: Buffer,
  params: Record<string, unknown> = {},
  baseName = "panel"
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

type Rgba = [number, number, number, number];

/** A panel with a `border`-thick ring, optional separate corner colour. */
function panel(
  w: number,
  h: number,
  border: number,
  ring: Rgba,
  interior: Rgba,
  corner: Rgba = ring
): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const onEdgeX = x < border || x >= w - border;
      const onEdgeY = y < border || y >= h - border;
      const colour = onEdgeX && onEdgeY ? corner : onEdgeX || onEdgeY ? ring : interior;
      raw.set(colour, (y * w + x) * 4);
    }
  }
  return toPng(raw, w, h);
}

/**
 * A panel built from concentric rings measured from every edge, optionally with
 * rounded (transparent) corners, the way real UI panels are drawn.
 */
function ringedPanel(
  w: number,
  h: number,
  rings: Array<{ thickness: number; colour: Rgba }>,
  interior: Rgba,
  radius = 0
): Promise<Buffer> {
  const raw = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const toCornerX = Math.min(x, w - 1 - x);
      const toCornerY = Math.min(y, h - 1 - y);
      if (
        radius > 0 &&
        toCornerX < radius &&
        toCornerY < radius &&
        Math.hypot(radius - toCornerX, radius - toCornerY) > radius
      ) {
        continue; // rounded corner: leave transparent
      }
      let limit = 0;
      let colour = interior;
      for (const ring of rings) {
        limit += ring.thickness;
        if (edge < limit) {
          colour = ring.colour;
          break;
        }
      }
      raw.set(colour, (y * w + x) * 4);
    }
  }
  return toPng(raw, w, h);
}

function pixelAt(img: RawImage, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

const RED: Rgba = [255, 0, 0, 255];
const GREEN: Rgba = [0, 200, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];

describe("nineSliceRegions", () => {
  test("splits a 20x14 panel with 3px borders into row-major regions", () => {
    const regions = nineSliceRegions(20, 14, {
      left: 3,
      right: 3,
      top: 3,
      bottom: 3,
    });
    expect(regions.map((region) => region.region)).toEqual([
      "top-left",
      "top",
      "top-right",
      "left",
      "center",
      "right",
      "bottom-left",
      "bottom",
      "bottom-right",
    ]);
    expect(regions.map(({ x, y, width, height }) => ({ x, y, w: width, h: height }))).toEqual([
      { x: 0, y: 0, w: 3, h: 3 },
      { x: 3, y: 0, w: 14, h: 3 },
      { x: 17, y: 0, w: 3, h: 3 },
      { x: 0, y: 3, w: 3, h: 8 },
      { x: 3, y: 3, w: 14, h: 8 },
      { x: 17, y: 3, w: 3, h: 8 },
      { x: 0, y: 11, w: 3, h: 3 },
      { x: 3, y: 11, w: 14, h: 3 },
      { x: 17, y: 11, w: 3, h: 3 },
    ]);
  });

  test("keeps only the center when there are no borders", () => {
    const regions = nineSliceRegions(10, 10, {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    });
    expect(regions).toHaveLength(9);
    const empty = regions.filter((region) => region.width === 0 || region.height === 0);
    expect(empty).toHaveLength(8);
    const center = regions.find((region) => region.region === "center")!;
    expect(center).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
  });
});

describe("detectBorders", () => {
  test("finds a uniform border ring", async () => {
    const img = await decodeRaw(await panel(20, 14, 3, RED, GREEN));
    expect(detectBorders(img, 8)).toEqual({
      left: 3,
      right: 3,
      top: 3,
      bottom: 3,
    });
  });

  test("ignores corner colours that differ from the edges", async () => {
    const img = await decodeRaw(await panel(20, 14, 4, RED, GREEN, BLUE));
    expect(detectBorders(img, 8)).toEqual({
      left: 4,
      right: 4,
      top: 4,
      bottom: 4,
    });
  });

  test("keeps decorative rings in the border", async () => {
    const dark: Rgba = [58, 62, 74, 255];
    const light: Rgba = [198, 206, 220, 255];
    const img = await decodeRaw(
      await ringedPanel(
        24,
        18,
        [
          { thickness: 2, colour: dark },
          { thickness: 2, colour: light },
        ],
        GREEN
      )
    );
    expect(detectBorders(img, 8)).toEqual({ left: 4, right: 4, top: 4, bottom: 4 });
  });

  test("pulls a rounded corner into the border", async () => {
    const dark: Rgba = [58, 62, 74, 255];
    const light: Rgba = [198, 206, 220, 255];
    const img = await decodeRaw(
      await ringedPanel(
        24,
        18,
        [
          { thickness: 2, colour: dark },
          { thickness: 2, colour: light },
        ],
        GREEN,
        5
      )
    );
    // The 5px transparent arc has to sit inside the corner, otherwise the
    // stretched edge strip would show a notch.
    expect(detectBorders(img, 8)).toEqual({ left: 5, right: 5, top: 5, bottom: 5 });
  });

  test("tolerance decides how far the flat interior reaches", async () => {
    const near: Rgba = [251, 4, 4, 255];
    const img = await decodeRaw(await panel(20, 14, 3, RED, near));
    // Exact matching stops at the ring; a loose tolerance swallows the whole row.
    expect(detectBorders(img, 0)).toEqual({ left: 3, right: 3, top: 3, bottom: 3 });
    expect(detectBorders(img, 20)).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });
});

describe("resolveBorders", () => {
  test("only guesses the sides that were not given", async () => {
    const img = await decodeRaw(await panel(20, 14, 3, RED, GREEN, BLUE));
    const { borders, detected } = resolveBorders(img, { left: 5 }, 8);
    expect(borders).toEqual({ left: 5, right: 3, top: 3, bottom: 3 });
    expect(detected).toEqual({
      left: false,
      right: true,
      top: true,
      bottom: true,
    });
  });

  test("rejects borders that leave no stretchable middle", async () => {
    const img = await decodeRaw(await panel(20, 14, 3, RED, GREEN));
    expect(() => resolveBorders(img, { left: 12, right: 12 }, 8)).toThrow(
      /不小于图片宽度/
    );
  });

  test("treats a uniform image as fully stretchable", async () => {
    const img = await decodeRaw(await toPng(solid(16, 16, RED), 16, 16));
    expect(resolveBorders(img, {}, 8).borders).toEqual({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    });
  });
});

describe("nine-slice", () => {
  test("exports the descriptor plus one slice per region", async () => {
    const results = await runAll(
      "nine-slice",
      await panel(20, 14, 3, RED, GREEN),
      { left: 3, right: 3, top: 3, bottom: 3 },
      "panel"
    );

    expect(results.map((file) => file.name)).toEqual([
      "panel_tl.png",
      "panel_t.png",
      "panel_tr.png",
      "panel_l.png",
      "panel_c.png",
      "panel_r.png",
      "panel_bl.png",
      "panel_b.png",
      "panel_br.png",
      "panel_9slice.json",
    ]);

    const json = JSON.parse(
      results[9].buffer.toString("utf-8")
    ) as NineSliceJson;
    expect(json.borders).toEqual({ left: 3, right: 3, top: 3, bottom: 3 });
    expect(json.detected).toEqual({
      left: false,
      right: false,
      top: false,
      bottom: false,
    });
    expect(json.minimumSize).toEqual({ w: 6, h: 6 });
    expect(json.meta.source).toBe("panel");
    expect(json.regions.center).toEqual({ x: 3, y: 3, w: 14, h: 8 });
    expect(json.regions["bottom-right"]).toEqual({ x: 17, y: 11, w: 3, h: 3 });
    expect(json.slices.center).toBe("panel_c.png");
    expect(json.slices["top-left"]).toBe("panel_tl.png");

    // The slices really are the regions they claim to be.
    const center = results[4];
    expect([center.width, center.height]).toEqual([14, 8]);
    expect(pixelAt(await decodeRaw(center.buffer), 0, 0)).toEqual(GREEN);
    const topLeft = results[0];
    expect([topLeft.width, topLeft.height]).toEqual([3, 3]);
    expect(pixelAt(await decodeRaw(topLeft.buffer), 0, 0)).toEqual(RED);
  });

  test("detects the borders when none are given", async () => {
    const results = await runAll("nine-slice", await panel(24, 16, 5, RED, GREEN, BLUE));
    const json = JSON.parse(
      results[results.length - 1].buffer.toString("utf-8")
    ) as NineSliceJson;

    expect(json.borders).toEqual({ left: 5, right: 5, top: 5, bottom: 5 });
    expect(json.detected).toEqual({
      left: true,
      right: true,
      top: true,
      bottom: true,
    });
    expect(json.regions.center).toEqual({ x: 5, y: 5, w: 14, h: 6 });
  });

  test("returns just the descriptor when slices are skipped", async () => {
    const result = await runTool(
      "nine-slice",
      await panel(20, 14, 3, RED, GREEN),
      { left: 3, right: 3, top: 3, bottom: 3, slices: false },
      "panel"
    );
    // Analysing only is a plain JSON response, not a file bundle.
    expect(Array.isArray(result)).toBe(false);
    const descriptor = result as ImageResult;
    expect(descriptor.name).toBe("panel_9slice.json");
    expect(descriptor.contentType).toBe("application/json");
    const json = JSON.parse(descriptor.buffer.toString("utf-8")) as NineSliceJson;
    expect(json.slices).toEqual({});
    expect(json.borders).toEqual({ left: 3, right: 3, top: 3, bottom: 3 });
  });

  test("rejects borders that overlap", async () => {
    await expect(
      runAll("nine-slice", await panel(20, 14, 3, RED, GREEN), {
        left: 12,
        right: 12,
        top: 3,
        bottom: 3,
      })
    ).rejects.toThrow(/不小于图片宽度/);
  });

  test("keeps a uniform image as a single center slice", async () => {
    const results = await runAll("nine-slice", await toPng(solid(16, 16, RED), 16, 16));
    // No fixed border at all: only the center region has any pixels.
    expect(results.map((file) => file.name)).toEqual([
      "panel_c.png",
      "panel_9slice.json",
    ]);
    const json = JSON.parse(results[1].buffer.toString("utf-8")) as NineSliceJson;
    expect(json.borders).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(json.minimumSize).toEqual({ w: 0, h: 0 });
    expect(json.regions.center).toEqual({ x: 0, y: 0, w: 16, h: 16 });
  });
});