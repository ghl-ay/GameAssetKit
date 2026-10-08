import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { runTool } from "./registry";
import { decodeRaw } from "./image-io";

/** Solid RGBA raw buffer helper */
function solid(w: number, h: number, rgba: [number, number, number, number]): Buffer {
  const raw = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    raw.set(rgba, i * 4);
  }
  return raw;
}

async function toPng(raw: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function decodeSize(buf: Buffer) {
  const meta = await sharp(buf).metadata();
  return { width: meta.width, height: meta.height, format: meta.format };
}

describe("compress", () => {
  test("converts png to jpeg", async () => {
    const png = await toPng(solid(32, 32, [255, 0, 0, 255]), 32, 32);
    const out = (await runTool("compress", png, { format: "jpeg", quality: 80 }, "a")) as any;
    expect(out.contentType).toBe("image/jpeg");
    expect(out.name).toBe("a.jpg");
  });

  test("keeps original format by default", async () => {
    const png = await toPng(solid(32, 32, [255, 0, 0, 255]), 32, 32);
    const out = (await runTool("compress", png, {}, "a")) as any;
    expect(out.ext).toBe("png");
  });
});

describe("resize", () => {
  test("scales to target size", async () => {
    const png = await toPng(solid(100, 50, [0, 128, 255, 255]), 100, 50);
    const out = (await runTool("resize", png, { width: 50, height: 25 }, "a")) as any;
    expect(out.width).toBe(50);
    expect(out.height).toBe(25);
  });

  test("withoutEnlargement keeps original size", async () => {
    const png = await toPng(solid(20, 20, [0, 0, 0, 255]), 20, 20);
    const out = (await runTool("resize", png, { width: 100, withoutEnlargement: true }, "a")) as any;
    expect(out.width).toBe(20);
  });

  test("requires at least one dimension", async () => {
    const png = await toPng(solid(10, 10, [0, 0, 0, 255]), 10, 10);
    await expect(runTool("resize", png, {}, "a")).rejects.toThrow();
  });
});

describe("crop", () => {
  test("extracts region", async () => {
    // 40x40, crop 10x10 at (5,6)
    const png = await toPng(solid(40, 40, [9, 9, 9, 255]), 40, 40);
    const out = (await runTool("crop", png, { left: 5, top: 6, width: 10, height: 10 }, "a")) as any;
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  test("rejects out-of-bounds region", async () => {
    const png = await toPng(solid(10, 10, [0, 0, 0, 255]), 10, 10);
    await expect(
      runTool("crop", png, { left: 0, top: 0, width: 50, height: 50 }, "a")
    ).rejects.toThrow();
  });
});

describe("transform", () => {
  test("rotate 90 swaps dimensions", async () => {
    const png = await toPng(solid(40, 20, [1, 2, 3, 255]), 40, 20);
    const out = (await runTool("transform", png, { rotate: 90 }, "a")) as any;
    expect(out.width).toBe(20);
    expect(out.height).toBe(40);
  });

  test("flipV flips pixels vertically", async () => {
    // top half red, bottom half blue
    const raw = Buffer.concat([
      solid(10, 5, [255, 0, 0, 255]),
      solid(10, 5, [0, 0, 255, 255]),
    ]);
    const png = await toPng(raw, 10, 10);
    const out = (await runTool("transform", png, { flipV: true }, "a")) as any;
    const img = await decodeRaw(out.buffer);
    // after vertical flip, top pixel should be blue, bottom red
    expect(img.data[0]).toBe(0);
    expect(img.data[2]).toBe(255);
    const last = (10 * 10 - 1) * 4;
    expect(img.data[last]).toBe(255);
    expect(img.data[last + 2]).toBe(0);
  });
});

describe("background-remover", () => {
  test("removes red background, keeps blue subject", async () => {
    // 30x30 red background, 10x10 blue square in the middle
    const raw = solid(30, 30, [255, 0, 0, 255]);
    raw.set([0, 0, 255, 255], (10 * 30 + 10) * 4);
    for (let y = 10; y < 20; y++) {
      for (let x = 10; x < 20; x++) {
        raw.set([0, 0, 255, 255], (y * 30 + x) * 4);
      }
    }
    const png = await toPng(raw, 30, 30);
    const out = (await runTool("background-remover", png, { tolerance: 10 }, "a")) as any;
    expect(out.contentType).toBe("image/png");

    const img = await decodeRaw(out.buffer);
    const corner = 0;
    const center = (15 * 30 + 15) * 4;
    expect(img.data[corner + 3]).toBe(0); // background gone
    expect(img.data[center + 3]).toBe(255); // subject kept
    expect(img.data[center]).toBe(0);
    expect(img.data[center + 2]).toBe(255);
  });

  test("accepts explicit target color", async () => {
    const raw = solid(10, 10, [0, 255, 0, 255]);
    const png = await toPng(raw, 10, 10);
    const out = (await runTool(
      "background-remover",
      png,
      { color: "#00ff00", tolerance: 5 },
      "a"
    )) as any;
    const img = await decodeRaw(out.buffer);
    expect(img.data[3]).toBe(0);
  });
});

describe("sprite-splitter", () => {
  test("finds two separated sprites", async () => {
    // 60x30 transparent, two 20x20 opaque squares
    const raw = solid(60, 30, [0, 0, 0, 0]);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) raw.set([255, 0, 0, 255], (y * 60 + x) * 4);
    }
    for (let y = 5; y < 25; y++) {
      for (let x = 40; x < 60; x++) raw.set([0, 255, 0, 255], (y * 60 + x) * 4);
    }
    const png = await toPng(raw, 60, 30);
    const out = (await runTool("sprite-splitter", png, {}, "sheet")) as any[];
    expect(out).toHaveLength(2);
    expect(out[0].width).toBe(20);
    expect(out[0].height).toBe(20);
    expect(out[1].width).toBe(20);
    expect(out[1].height).toBe(20);
    expect(out[0].name).toBe("sheet_1.png");
    expect(out[1].name).toBe("sheet_2.png");
  });

  test("grid mode splits evenly", async () => {
    const png = await toPng(solid(60, 30, [1, 1, 1, 255]), 60, 30);
    const out = (await runTool("sprite-splitter", png, { mode: "grid", columns: 3, rows: 2 }, "s")) as any[];
    expect(out).toHaveLength(6);
    expect(out[0].width).toBe(20);
    expect(out[0].height).toBe(15);
  });

  test("grid mode requires columns and rows", async () => {
    const png = await toPng(solid(10, 10, [0, 0, 0, 255]), 10, 10);
    await expect(
      runTool("sprite-splitter", png, { mode: "grid" }, "a")
    ).rejects.toThrow();
  });
});

describe("vectorize", () => {
  test("produces svg output", async () => {
    const png = await toPng(solid(16, 16, [200, 30, 30, 255]), 16, 16);
    const out = (await runTool("vectorize", png, {}, "a")) as any;
    expect(out.contentType).toBe("image/svg+xml");
    expect(out.buffer.toString("utf-8")).toContain("<svg");
  });
});

describe("registry", () => {
  test("unknown tool throws", async () => {
    const png = await toPng(solid(4, 4, [0, 0, 0, 255]), 4, 4);
    await expect(runTool("nope", png, {}, "a")).rejects.toThrow("Unknown tool");
  });

  test("unknown params are stripped", async () => {
    const png = await toPng(solid(10, 10, [5, 5, 5, 255]), 10, 10);
    const out = (await runTool("compress", png, { bogus: 1, format: "webp" }, "a")) as any;
    expect(out.ext).toBe("webp");
  });
});

describe("decoded png integrity", () => {
  test("roundtrip preserves size", async () => {
    const png = await toPng(solid(33, 21, [80, 90, 100, 255]), 33, 21);
    const size = await decodeSize(png);
    expect(size.width).toBe(33);
    expect(size.height).toBe(21);
    expect(size.format).toBe("png");
  });
});
