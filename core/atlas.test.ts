import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { packAtlas, type AtlasPlacement } from "./atlas";
import { runTool, type ToolInput } from "./registry";
import { decodeRaw } from "./image-io";
import type { ImageResult } from "./types";

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasJson {
  meta: { image: string; size: { w: number; h: number } };
  frames: Record<
    string,
    {
      frame: Frame;
      trimmed: boolean;
      spriteSourceSize: Frame;
      sourceSize: { w: number; h: number };
    }
  >;
}

async function runMany(
  tool: string,
  inputs: ToolInput[],
  params: Record<string, unknown> = {},
  baseName = "atlas"
): Promise<ImageResult[]> {
  const result = await runTool(tool, inputs, params, baseName);
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

function png(w: number, h: number, rgba: [number, number, number, number]): Promise<Buffer> {
  return toPng(solid(w, h, rgba), w, h);
}

/** True when two frames are closer than `padding` on both axes. */
function collide(a: AtlasPlacement, b: AtlasPlacement, padding: number): boolean {
  return (
    a.x + a.width + padding > b.x &&
    b.x + b.width + padding > a.x &&
    a.y + a.height + padding > b.y &&
    b.y + b.height + padding > a.y
  );
}

describe("packAtlas", () => {
  test("places every item inside the atlas without collisions", () => {
    const items = [
      { name: "a.png", width: 40, height: 30 },
      { name: "b.png", width: 20, height: 60 },
      { name: "c.png", width: 35, height: 35 },
      { name: "d.png", width: 12, height: 12 },
    ];
    const padding = 2;
    const layout = packAtlas(items, { padding, maxWidth: 512, maxHeight: 512 });

    expect(layout.placements).toHaveLength(items.length);
    for (const placement of layout.placements) {
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.y).toBeGreaterThanOrEqual(0);
      expect(placement.x + placement.width).toBeLessThanOrEqual(layout.width);
      expect(placement.y + placement.height).toBeLessThanOrEqual(layout.height);
    }
    for (let i = 0; i < layout.placements.length; i++) {
      for (let j = i + 1; j < layout.placements.length; j++) {
        expect(collide(layout.placements[i], layout.placements[j], padding)).toBe(false);
      }
    }
    expect(layout.width * layout.height).toBeLessThan(512 * 512);
  });

  test("is deterministic", () => {
    const items = [
      { name: "a.png", width: 17, height: 33 },
      { name: "b.png", width: 11, height: 9 },
    ];
    const options = { padding: 1, maxWidth: 256, maxHeight: 256 };
    expect(packAtlas(items, options)).toEqual(packAtlas(items, options));
  });

  test("rejects a frame larger than the atlas limit", () => {
    expect(() =>
      packAtlas([{ name: "big.png", width: 300, height: 300 }], {
        padding: 0,
        maxWidth: 256,
        maxHeight: 256,
      })
    ).toThrow(/big\.png/);
  });

  test("rejects a set that cannot fit", () => {
    const items = [
      { name: "a.png", width: 200, height: 200 },
      { name: "b.png", width: 200, height: 200 },
    ];
    expect(() =>
      packAtlas(items, { padding: 0, maxWidth: 256, maxHeight: 256 })
    ).toThrow(/无法在/);
  });
});

describe("atlas-packer", () => {
  test("packs several images into one atlas plus metadata", async () => {
    const inputs: ToolInput[] = [
      { name: "hero.png", buffer: await png(20, 10, [255, 0, 0, 255]) },
      { name: "foe.png", buffer: await png(12, 12, [0, 255, 0, 255]) },
    ];

    const [image, meta] = await runMany("atlas-packer", inputs, { padding: 2 });
    expect(image.name).toBe("atlas.png");
    expect(image.contentType).toBe("image/png");
    expect(meta.name).toBe("atlas.json");

    const atlas = await decodeRaw(image.buffer);
    expect(image.width).toBe(atlas.width);
    expect(image.height).toBe(atlas.height);

    const json = JSON.parse(meta.buffer.toString("utf-8")) as AtlasJson;
    expect(json.meta.image).toBe("atlas.png");
    expect(json.meta.size).toEqual({ w: atlas.width, h: atlas.height });
    expect(Object.keys(json.frames).sort()).toEqual(["foe.png", "hero.png"]);

    // Frames stay inside the atlas and every sprite landed where it says.
    for (const [key, value] of Object.entries(json.frames)) {
      const { frame } = value;
      expect(frame.x + frame.w).toBeLessThanOrEqual(atlas.width);
      expect(frame.y + frame.h).toBeLessThanOrEqual(atlas.height);
      const expected = key === "hero.png" ? [255, 0, 0] : [0, 255, 0];
      const offset = (frame.y * atlas.width + frame.x) * 4;
      expect([
        atlas.data[offset],
        atlas.data[offset + 1],
        atlas.data[offset + 2],
      ]).toEqual(expected);
      expect(atlas.data[offset + 3]).toBe(255);
    }
  });

  test("trims transparent borders and records the source rect", async () => {
    // 40x40 canvas, 10x10 content at (5, 6)
    const raw = solid(40, 40, [0, 0, 0, 0]);
    for (let y = 6; y < 16; y++) {
      for (let x = 5; x < 15; x++) raw.set([10, 20, 30, 255], (y * 40 + x) * 4);
    }
    const inputs: ToolInput[] = [
      { name: "a.png", buffer: await toPng(raw, 40, 40) },
      { name: "b.png", buffer: await png(30, 30, [0, 0, 0, 0]) },
    ];

    const [image, meta] = await runMany("atlas-packer", inputs, {
      trim: true,
      padding: 0,
    });
    const json = JSON.parse(meta.buffer.toString("utf-8")) as AtlasJson;

    expect(json.frames["a.png"].trimmed).toBe(true);
    expect(json.frames["a.png"].spriteSourceSize).toEqual({
      x: 5,
      y: 6,
      w: 10,
      h: 10,
    });
    expect(json.frames["a.png"].sourceSize).toEqual({ w: 40, h: 40 });
    expect(json.frames["a.png"].frame).toEqual({ x: 0, y: 0, w: 10, h: 10 });

    // A fully transparent frame collapses to 1x1 instead of wasting atlas space.
    expect(json.frames["b.png"].frame).toEqual({ x: 10, y: 0, w: 1, h: 1 });
    expect(json.frames["b.png"].sourceSize).toEqual({ w: 30, h: 30 });
    expect(image.width).toBe(11);
    expect(image.height).toBe(10);
  });

  test("extrudes edge colours into the padding", async () => {
    const inputs: ToolInput[] = [
      { name: "a.png", buffer: await png(4, 4, [255, 0, 0, 255]) },
      { name: "b.png", buffer: await png(4, 4, [0, 0, 255, 255]) },
    ];
    const [image] = await runMany("atlas-packer", inputs, {
      padding: 4,
      extrude: 4,
      maxWidth: 64,
      maxHeight: 64,
    });

    const atlas = await decodeRaw(image.buffer);
    // Bleeding reaches every gap pixel: nothing is left as transparent black.
    for (let i = 0; i < atlas.width * atlas.height; i++) {
      const r = atlas.data[i * 4];
      const g = atlas.data[i * 4 + 1];
      const b = atlas.data[i * 4 + 2];
      const alpha = atlas.data[i * 4 + 3];
      expect(g).toBe(0);
      expect((r === 255 && b === 0) || (b === 255 && r === 0)).toBe(true);
      if (alpha === 0) expect(r + b).toBeGreaterThan(0);
    }
  });

  test("rounds a power of two atlas and rejects an oversized one", async () => {
    const inputs: ToolInput[] = [
      { name: "a.png", buffer: await png(20, 20, [255, 0, 0, 255]) },
      { name: "b.png", buffer: await png(20, 20, [0, 255, 0, 255]) },
    ];
    const [image] = await runMany("atlas-packer", inputs, {
      padding: 0,
      powerOfTwo: true,
    });
    const isPowerOfTwo = (n: number) => (n & (n - 1)) === 0;
    expect(isPowerOfTwo(image.width ?? 0)).toBe(true);
    expect(isPowerOfTwo(image.height ?? 0)).toBe(true);
    expect((image.width ?? 0) * (image.height ?? 0)).toBeGreaterThanOrEqual(800);

    await expect(
      runMany("atlas-packer", inputs, {
        padding: 0,
        powerOfTwo: true,
        maxWidth: 60,
        maxHeight: 60,
      })
    ).rejects.toThrow(/2 的幂/);
  });

  test("requires at least two images", async () => {
    const inputs: ToolInput[] = [
      { name: "a.png", buffer: await png(8, 8, [255, 0, 0, 255]) },
    ];
    await expect(runMany("atlas-packer", inputs)).rejects.toThrow(/至少需要 2 张/);
  });

  test("rejects a single image passed to a multi-input tool", async () => {
    const buffer = await png(8, 8, [255, 0, 0, 255]);
    await expect(runTool("atlas-packer", buffer, {}, "a")).rejects.toThrow(
      /several input images/
    );
  });
});