/**
 * Image Master CLI.
 *
 * Usage: bun cli.ts <tool> <input> [key=value ...] [--out <dir>]
 * Example: bun cli.ts compress photo.png format=jpeg quality=80
 * Run `bun cli.ts` with no args to list tools and their params.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { listTools, getTool, runTool } from "./core/registry";

function printHelp() {
  console.log("用法: bun cli.ts <tool> <input> [key=value ...] [--out <dir>]\n");
  console.log("可用工具:");
  for (const tool of listTools()) {
    console.log(`  ${tool.name.padEnd(20)} ${tool.title}`);
    const shape = z.object(tool.params);
    for (const [key, field] of Object.entries(tool.params)) {
      const meta = (field as { description?: string }).description;
      const optional = field.isOptional?.() ?? false;
      console.log(
        `    ${key}${optional ? "?" : ""}`.padEnd(24) + (meta ?? "")
      );
    }
    void shape;
  }
  console.log("\n示例:");
  console.log("  bun cli.ts compress a.png format=jpeg quality=80");
  console.log("  bun cli.ts resize a.png width=200 height=100 fit=cover");
  console.log("  bun cli.ts background-remover a.png color=#ff0000 tolerance=15");
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

const [toolName, inputPathRaw, ...rest] = argv;

let outDir = path.resolve("output");
const options: Record<string, unknown> = {};
for (let i = 0; i < rest.length; i++) {
  const arg = rest[i];
  if (arg === "--out") {
    outDir = path.resolve(rest[++i]);
    continue;
  }
  const eq = arg.indexOf("=");
  if (eq === -1) {
    console.error(`无效参数: ${arg}(应为 key=value)`);
    process.exit(1);
  }
  options[arg.slice(0, eq)] = coerce(arg.slice(eq + 1));
}

const tool = getTool(toolName);
if (!tool) {
  console.error(`未知工具: ${toolName}。可用: ${listTools().map((t) => t.name).join(", ")}`);
  process.exit(1);
}

try {
  const inputPath = path.resolve(inputPathRaw);
  const input = await readFile(inputPath);
  const baseName = path.basename(inputPath).replace(/\.[^/.]+$/, "") || "image";
  const results = await runTool(toolName, input, options, baseName);
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
} catch (e) {
  console.error(`失败: ${(e as Error).message}`);
  process.exit(1);
}
