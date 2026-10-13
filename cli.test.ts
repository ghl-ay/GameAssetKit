import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir);
const CLI = path.join(ROOT, "cli.ts");

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], env?: Record<string, string>): Promise<CliResult> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  return {
    exitCode,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  };
}

/** A solid PNG fixture in a fresh temp folder. */
async function makeWorkspace(): Promise<{ dir: string; out: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "im-cli-"));
  const out = path.join(dir, "out");
  return { dir, out };
}

async function writePng(dir: string, name: string, width: number, height: number): Promise<void> {
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) raw.set([10, 120, 200, 255], i * 4);
  const buffer = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  await writeFile(path.join(dir, name), buffer);
}

describe("cli --dir", () => {
  test("lints a folder and reports problems without failing the run", async () => {
    const { dir, out } = await makeWorkspace();
    await writePng(dir, "good.png", 64, 64);
    await writePng(dir, "bad.png", 100, 50);

    const result = await runCli(["asset-lint", "--dir", dir, "powerOfTwo=true", "--out", out]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("lint-report.json");
    const report = JSON.parse(await readFile(path.join(out, "lint-report.json"), "utf-8")) as {
      ok: boolean;
      summary: { files: number; errorCount: number };
      files: Array<{ name: string; issues: Array<{ rule: string }> }>;
    };
    expect(report.ok).toBe(false);
    expect(report.summary.files).toBe(2);
    expect(report.summary.errorCount).toBe(1);
    expect(report.files.find((file) => file.name === "bad.png")?.issues[0].rule).toBe("powerOfTwo");

    await rm(dir, { recursive: true, force: true });
  });
});

describe("cli --fail-on-issues", () => {
  test("exits 1 when the report has unresolved problems", async () => {
    const { dir, out } = await makeWorkspace();
    await writePng(dir, "bad.png", 100, 50);

    const result = await runCli([
      "asset-lint",
      "--dir",
      dir,
      "powerOfTwo=true",
      "--fail-on-issues",
      "--out",
      out,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("lint-report.json");
    expect(result.stderr).toContain("1 个错误");
    await rm(dir, { recursive: true, force: true });
  });

  test("exits 0 when everything passes", async () => {
    const { dir, out } = await makeWorkspace();
    await writePng(dir, "good.png", 64, 64);

    const result = await runCli([
      "asset-lint",
      "--dir",
      dir,
      "powerOfTwo=true",
      "--fail-on-issues",
      "--out",
      out,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    await rm(dir, { recursive: true, force: true });
  });

  test("honours the environment variable as well", async () => {
    const { dir, out } = await makeWorkspace();
    await writePng(dir, "bad.png", 100, 50);

    const result = await runCli(["asset-lint", "--dir", dir, "powerOfTwo=true", "--out", out], {
      IMAGE_MASTER_FAIL_ON_ISSUES: "1",
    });

    expect(result.exitCode).toBe(1);
    await rm(dir, { recursive: true, force: true });
  });

  test("ignores tools that do not produce a report", async () => {
    const { dir, out } = await makeWorkspace();
    await writePng(dir, "sprite.png", 32, 32);

    const result = await runCli([
      "trim",
      path.join(dir, "sprite.png"),
      "powerOfTwo=true",
      "--fail-on-issues",
      "--out",
      out,
    ]);

    expect(result.exitCode).toBe(0);
    await rm(dir, { recursive: true, force: true });
  });
});