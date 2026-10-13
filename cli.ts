/**
 * Image Master CLI.
 *
 * Usage: bun cli.ts <tool> <input...> [key=value ...] [--out <dir>] [--dir <folder>]
 *        [--fail-on-issues]
 * Example: bun cli.ts compress photo.png format=jpeg quality=80
 *          bun cli.ts atlas-packer a.png b.png name=ui padding=4
 *          bun cli.ts asset-lint --dir ./assets powerOfTwo=true
 * Run `bun cli.ts` with no args to list tools and their params.
 */

/** Files picked up by --dir (a flat scan, no subdirectories). */
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getTool,
  isMultiTool,
  listTools,
  runTool,
  type ToolInput,
} from "./core/registry";

function printHelp() {
  console.log(
    "用法: bun cli.ts <tool> <input...> [key=value ...] [--out <dir>] [--dir <folder>] [--fail-on-issues]\n"
  );
  console.log("可用工具:");
  for (const tool of listTools()) {
    const tag = isMultiTool(tool) ? " [多图]" : "";
    console.log(`  ${tool.name.padEnd(20)} ${tool.title}${tag}`);
    for (const [key, field] of Object.entries(tool.params)) {
      const meta = (field as { description?: string }).description;
      const optional = field.isOptional?.() ?? false;
      console.log(`    ${key}${optional ? "?" : ""}`.padEnd(24) + (meta ?? ""));
    }
  }
  console.log("\n示例:");
  console.log("  bun cli.ts compress a.png format=jpeg quality=80");
  console.log("  bun cli.ts resize a.png width=200 height=100 fit=cover");
  console.log("  bun cli.ts trim a.png padding=4 powerOfTwo=true anchor=bottom");
  console.log("  bun cli.ts atlas-packer a.png b.png c.png name=ui padding=4 trim=true");
  console.log("  bun cli.ts asset-lint --dir ./assets powerOfTwo=true maxSize=2048 --fail-on-issues");
}

function coerce(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const argv = process.argv.slice(2);
if (argv.length < 2 || argv[0] === "help" || argv[0] === "--help") {
  printHelp();
  process.exit(argv.length < 1 ? 1 : 0);
}

const [toolName, ...rest] = argv;

let outDir = path.resolve("output");
// CI mode: a report that comes back with ok=false turns into a non-zero exit code.
let failOnIssues =
  process.env.IMAGE_MASTER_FAIL_ON_ISSUES === "1" ||
  process.env.IMAGE_MASTER_FAIL_ON_ISSUES === "true";
const options: Record<string, unknown> = {};
const inputPaths: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const arg = rest[i];
  if (arg === "--out") {
    outDir = path.resolve(rest[++i] ?? "output");
    continue;
  }
  if (arg === "--fail-on-issues") {
    failOnIssues = true;
    continue;
  }
  if (arg === "--dir") {
    // Batch friendly: lint/atlas a whole folder without listing every file.
    const dir = path.resolve(rest[++i] ?? ".");
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      if (
        entry.isFile() &&
        IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        inputPaths.push(path.join(dir, entry.name));
      }
    }
    continue;
  }
  const eq = arg.indexOf("=");
  if (eq === -1) {
    inputPaths.push(arg);
    continue;
  }
  options[arg.slice(0, eq)] = coerce(arg.slice(eq + 1));
}

const tool = getTool(toolName);
if (!tool) {
  console.error(`未知工具: ${toolName}。可用: ${listTools().map((t) => t.name).join(", ")}`);
  process.exit(1);
}

const multi = isMultiTool(tool);
const minInputs = multi ? (tool.minInputs ?? 2) : 1;
if (inputPaths.length === 0) {
  console.error("缺少输入图片路径(也可以用 --dir <folder> 批量传入)");
  process.exit(1);
}
if (multi && inputPaths.length < minInputs) {
  console.error(`${toolName} 至少需要 ${minInputs} 个输入图片`);
  process.exit(1);
}
if (!multi && inputPaths.length > 1) {
  console.error(`${toolName} 只接受 1 个输入图片`);
  process.exit(1);
}

try {
  const inputs: ToolInput[] = [];
  for (const inputPathRaw of inputPaths) {
    const absolute = path.resolve(inputPathRaw);
    inputs.push({
      name: path.basename(absolute),
      buffer: await readFile(absolute),
    });
  }
  const baseName =
    path.basename(path.resolve(inputPaths[0])).replace(/\.[^/.]+$/, "") || "image";

  const results = await runTool(
    toolName,
    multi ? inputs : inputs[0].buffer,
    options,
    baseName
  );
  await mkdir(outDir, { recursive: true });

  const list = Array.isArray(results) ? results : [results];
  const written: string[] = [];
  for (const file of list) {
    const filePath = path.join(outDir, file.name);
    await writeFile(filePath, file.buffer);
    written.push(filePath);
    console.log(
      `✔ ${filePath}${file.width ? ` (${file.width}x${file.height})` : ""}`
    );
  }
  if (Array.isArray(results)) {
    console.log(`共 ${written.length} 个文件`);
  }

  if (failOnIssues) {
    const failed: Array<{
      name: string;
      summary?: { errorCount?: number; warningCount?: number };
    }> = [];

    for (const file of list) {
      if (file.ext !== "json") continue;
      try {
        const report = JSON.parse(file.buffer.toString("utf-8")) as {
          ok?: unknown;
          summary?: { errorCount?: number; warningCount?: number };
        };
        if (report.ok === false) failed.push({ name: file.name, summary: report.summary });
      } catch {
        // not a JSON report: nothing to fail on
      }
    }

    if (failed.length > 0) {
      for (const entry of failed) {
        console.error(
          `✖ ${entry.name}: ${entry.summary?.errorCount ?? "?"} 个错误 / ${entry.summary?.warningCount ?? "?"} 个警告`
        );
      }
      console.error("✖ 检查未通过(--fail-on-issues),退出码 1");
      process.exit(1);
    }
  }
} catch (e) {
  console.error(`失败: ${(e as Error).message}`);
  process.exit(1);
}