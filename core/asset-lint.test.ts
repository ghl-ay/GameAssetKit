import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { lintAssets, type LintFile, type LintReport, type LintRules } from "./asset-lint";
import { runTool, type ToolInput } from "./registry";

function file(overrides: Partial<LintFile> = {}): LintFile {
  return {
    name: "hero.png",
    width: 128,
    height: 128,
    format: "png",
    hasAlpha: true,
    bytes: 4096,
    empty: false,
    hash: overrides.hash ?? "aaaa1111",
    ...overrides,
  };
}

function rules(overrides: Partial<LintRules> = {}): LintRules {
  return { powerOfTwo: false, alpha: "any", forbidEmpty: false, ...overrides };
}

function issueRules(report: LintReport, index = 0): string[] {
  return report.files[index].issues.map((issue) => issue.rule);
}

function solid(w: number, h: number, rgba: [number, number, number, number]): Buffer {
  const raw = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) raw.set(rgba, i * 4);
  return raw;
}

function png(w: number, h: number, rgba: [number, number, number, number]): Promise<Buffer> {
  return sharp(solid(w, h, rgba), { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}

/** A PNG whose left half is transparent, so it really has an alpha channel. */
function pngWithAlpha(w: number, h: number): Promise<Buffer> {
  const raw = solid(w, h, [200, 30, 30, 255]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w / 2; x++) raw.set([0, 0, 0, 0], (y * w + x) * 4);
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function runLint(
  inputs: ToolInput[],
  params: Record<string, unknown> = {}
): Promise<LintReport & { meta: { app: string } }> {
  const result = await runTool("asset-lint", inputs, params, "assets");
  if (Array.isArray(result)) throw new Error("expected a single report");
  return JSON.parse(result.buffer.toString("utf-8"));
}

describe("lintAssets", () => {
  test("passes a clean file", () => {
    const report = lintAssets([file()], rules());
    expect(report.ok).toBe(true);
    expect(report.files[0].status).toBe("ok");
    expect(report.summary).toMatchObject({
      files: 1,
      passed: 1,
      failed: 0,
      errorCount: 0,
      warningCount: 0,
      totalBytes: 4096,
    });
  });

  test("flags sizes, alignment and the size ceiling", () => {
    const report = lintAssets(
      [file({ width: 100, height: 50 })],
      rules({ powerOfTwo: true, multipleOf: 8, maxSize: 64 })
    );
    expect(report.ok).toBe(false);
    expect(report.files[0].status).toBe("error");
    expect(issueRules(report)).toEqual(["powerOfTwo", "multipleOf", "maxSize"]);
    expect(report.files[0].issues[0].message).toContain("100x50");
    expect(report.summary.errorCount).toBe(3);
  });

  test("accepts a power of two file", () => {
    const report = lintAssets([file({ width: 64, height: 256 })], rules({ powerOfTwo: true }));
    expect(report.ok).toBe(true);
  });

  test("checks the format whitelist, treating jpg as jpeg", () => {
    const jpegFile = { name: "hero.jpg", format: "jpeg" };
    const rejected = lintAssets([file(jpegFile)], rules({ formats: ["png"] }));
    expect(issueRules(rejected)).toEqual(["formats"]);

    const accepted = lintAssets([file(jpegFile)], rules({ formats: ["jpg", "webp"] }));
    expect(accepted.ok).toBe(true);
  });

  test("flags an extension that contradicts the content", () => {
    const report = lintAssets([file({ name: "hero.jpg", format: "png" })], rules());
    expect(issueRules(report)).toEqual(["extension"]);
    expect(report.files[0].issues[0].message).toContain("实际格式 png");
  });

  test("checks the alpha channel both ways", () => {
    const required = lintAssets([file({ hasAlpha: false })], rules({ alpha: "required" }));
    expect(issueRules(required)).toEqual(["alpha"]);

    const forbidden = lintAssets([file({ hasAlpha: true })], rules({ alpha: "forbidden" }));
    expect(issueRules(forbidden)).toEqual(["alpha"]);

    expect(lintAssets([file({ hasAlpha: false })], rules({ alpha: "forbidden" })).ok).toBe(true);
  });

  test("checks the file size ceiling", () => {
    const report = lintAssets([file({ bytes: 4096 })], rules({ maxKilobytes: 2 }));
    expect(issueRules(report)).toEqual(["maxKilobytes"]);
    expect(report.files[0].issues[0].message).toContain("4.0 KB");
  });

  test("checks the file name pattern", () => {
    const pattern = "^[a-z0-9_]+\\.png$";
    expect(lintAssets([file({ name: "Hero Sprite.png" })], rules({ namePattern: pattern })).ok).toBe(false);
    expect(issueRules(lintAssets([file({ name: "Hero Sprite.png" })], rules({ namePattern: pattern })))).toEqual([
      "namePattern",
    ]);
    expect(lintAssets([file({ name: "hero_idle_01.png" })], rules({ namePattern: pattern })).ok).toBe(true);
  });

  test("rejects an invalid name pattern", () => {
    expect(() => lintAssets([file()], rules({ namePattern: "[" }))).toThrow(/不是合法正则/);
  });

  test("warns about empty images, and fails them when asked", () => {
    const warned = lintAssets([file({ empty: true })], rules());
    expect(warned.ok).toBe(true);
    expect(warned.files[0].status).toBe("warn");
    expect(warned.summary).toMatchObject({ passed: 0, warned: 1, warningCount: 1 });

    const failed = lintAssets([file({ empty: true })], rules({ forbidEmpty: true }));
    expect(failed.ok).toBe(false);
    expect(failed.files[0].status).toBe("error");
    expect(failed.summary.failed).toBe(1);
  });

  test("warns about duplicated content once per copy", () => {
    const report = lintAssets(
      [
        file({ name: "hero.png", hash: "same" }),
        file({ name: "hero_copy.png", hash: "same" }),
        file({ name: "other.png", hash: "different" }),
      ],
      rules()
    );
    expect(report.ok).toBe(true);
    expect(report.files[0].issues).toEqual([]);
    expect(report.files[1].issues[0].rule).toBe("duplicate");
    expect(report.files[1].issues[0].message).toContain("hero.png");
    expect(report.files[2].issues).toEqual([]);
  });
});

describe("asset-lint", () => {
  test("reports a mixed batch", async () => {
    const inputs: ToolInput[] = [
      { name: "hero.png", buffer: await pngWithAlpha(64, 64) },
      { name: "enemy.png", buffer: await png(100, 50, [10, 20, 30, 255]) },
      { name: "ghost.png", buffer: await png(32, 32, [0, 0, 0, 0]) },
    ];
    const report = await runLint(inputs, { powerOfTwo: true, maxSize: 64 });

    expect(report.meta.app).toBe("image-master");
    expect(report.rules).toMatchObject({ powerOfTwo: true, maxSize: 64, alpha: "any" });
    expect(report.ok).toBe(false);
    expect(report.summary).toMatchObject({
      files: 3,
      passed: 1,
      failed: 1,
      warned: 1,
      errorCount: 2,
    });

    const [hero, enemy, ghost] = report.files;
    expect(hero).toMatchObject({ name: "hero.png", width: 64, height: 64, status: "ok" });
    expect(enemy.status).toBe("error");
    expect(enemy.issues.map((issue) => issue.rule)).toEqual(["powerOfTwo", "maxSize"]);
    expect(ghost.status).toBe("warn");
    expect(ghost.issues[0]).toMatchObject({ rule: "empty", level: "warning" });
  });

  test("catches an extension that lies about the content", async () => {
    const report = await runLint([{ name: "hero.jpg", buffer: await png(16, 16, [1, 2, 3, 255]) }]);
    expect(report.files[0].format).toBe("png");
    expect(report.files[0].issues[0].rule).toBe("extension");
  });

  test("catches identical files", async () => {
    const buffer = await png(16, 16, [9, 9, 9, 255]);
    const report = await runLint([
      { name: "a.png", buffer },
      { name: "b.png", buffer },
    ]);
    expect(report.files[1].issues[0].rule).toBe("duplicate");
    expect(report.summary.errorCount).toBe(0);
  });

  test("checks a single file and writes the report under the given name", async () => {
    const result = await runTool(
      "asset-lint",
      [{ name: "solo.png", buffer: await pngWithAlpha(32, 32) }],
      { name: "my-report", alpha: "required" },
      "solo"
    );
    expect(Array.isArray(result)).toBe(false);
    const single = result as { name: string; contentType: string };
    expect(single.name).toBe("my-report.json");
    expect(single.contentType).toBe("application/json");
  });

  test("fails a file without an alpha channel", async () => {
    const jpeg = await sharp(solid(16, 16, [200, 10, 10, 255]), {
      raw: { width: 16, height: 16, channels: 4 },
    })
      .jpeg()
      .toBuffer();
    const report = await runLint([{ name: "hero.jpg", buffer: jpeg }], {
      alpha: "required",
      formats: ["jpeg"],
    });
    expect(report.ok).toBe(false);
    expect(report.files[0].issues.map((issue) => issue.rule)).toEqual(["alpha"]);
  });
});