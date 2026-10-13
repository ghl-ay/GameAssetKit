/**
 * Image Master MCP Server (stdio).
 *
 * Run: bun mcp/server.ts
 *
 * Two families of tools are exposed:
 *
 * 1. `core/` tools (sharp based) — pure server-side image processing.
 * 2. Browser-only AI tools (ONNX Runtime Web + Workers) — driven through a real
 *    headless browser against the running web app. These need the app on
 *    IMAGE_MASTER_BASE_URL (default http://localhost:3000); it is started
 *    automatically with `bun dev` unless IMAGE_MASTER_AUTOSTART=false.
 *
 * Results are written to IMAGE_MASTER_OUTPUT_DIR (default <project>/output).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMultiTool, tools, type ToolInput } from "../core/registry";
import type { ImageResult } from "../core/types";
import { runUpscale, runBackgroundRemoveAi, runInpaint } from "./browser/tools";
import { closeBrowser } from "./browser/session";

const outputDir =
  process.env.IMAGE_MASTER_OUTPUT_DIR ??
  path.resolve(import.meta.dir, "../output");

const server = new McpServer({
  name: "image-master",
  version: "0.2.0",
});

/** Persist tool output(s) to the output dir and shape the MCP response. */
async function writeResults(result: ImageResult | ImageResult[]) {
  await mkdir(outputDir, { recursive: true });

  if (Array.isArray(result)) {
    const outputs: string[] = [];
    for (const file of result) {
      const filePath = path.join(outputDir, file.name);
      await writeFile(filePath, file.buffer);
      outputs.push(filePath);
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ outputs, count: outputs.length }),
        },
      ],
    };
  }

  const filePath = path.join(outputDir, result.name);
  await writeFile(filePath, result.buffer);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          output: filePath,
          width: result.width,
          height: result.height,
          originalWidth: result.originalWidth,
          originalHeight: result.originalHeight,
        }),
      },
    ],
  };
}

function toolError(e: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: (e as Error).message }],
  };
}

/** Multi-image tools take a list of paths instead of a single one. */
function registerMultiInputTool(tool: Extract<typeof tools[string], { multiInput: true }>) {
  const minInputs = tool.minInputs ?? 2;
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: `${tool.description}\n输入为多张本地图片路径,处理结果写入输出目录,返回 JSON(包含输出文件路径)。`,
      inputSchema: {
        paths: z
          .array(z.string())
          .min(minInputs)
          .describe(
            "输入图片的本地绝对路径列表(" +
              (minInputs > 1 ? "至少 " + minInputs + " 张,顺序即打包顺序" : "至少 1 张") +
              ")"
          ),
        ...tool.params,
      },
    },
    async (args) => {
      const { paths: inputPaths, ...params } = args as Record<string, unknown> & {
        paths: string[];
      };
      try {
        const inputs: ToolInput[] = [];
        for (const inputPath of inputPaths) {
          inputs.push({
            name: path.basename(inputPath),
            buffer: await readFile(inputPath),
          });
        }
        const baseName =
          path.basename(inputPaths[0]).replace(/\.[^/.]+$/, "") || "image";
        return await writeResults(await tool.runMulti(inputs, params, baseName));
      } catch (e) {
        return toolError(e);
      }
    }
  );
}

for (const tool of Object.values(tools)) {
  if (isMultiTool(tool)) {
    registerMultiInputTool(tool);
    continue;
  }

  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: `${tool.description}\n输入为本地图片路径,处理结果写入输出目录,返回 JSON(包含输出文件路径与尺寸)。`,
      inputSchema: {
        path: z.string().describe("输入图片的本地绝对路径"),
        ...tool.params,
      },
    },
    async (args) => {
      const { path: inputPath, ...params } = args as Record<string, unknown> & {
        path: string;
      };
      try {
        const input = await readFile(inputPath);
        const baseName =
          path.basename(inputPath).replace(/\.[^/.]+$/, "") || "image";
        return await writeResults(await tool.run(input, params, baseName));
      } catch (e) {
        return toolError(e);
      }
    }
  );
}

/** Wrap a browser-driven tool so failures surface as MCP tool errors. */
async function browserTool(run: () => Promise<string>) {
  try {
    const filePath = await run();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ output: filePath }),
        },
      ],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: (e as Error).message }],
    };
  }
}

server.registerTool(
  "upscale",
  {
    title: "AI 超分放大 (Real-ESRGAN 4x)",
    description:
      "使用 Real-ESRGAN 深度学习模型将图片放大 4 倍并增强细节。运行在浏览器 ONNX Runtime 中,首次调用会自动下载约 64MB 模型并缓存。",
    inputSchema: {
      path: z.string().describe("输入图片的本地绝对路径"),
      outDir: z.string().optional().describe("输出目录,默认 IMAGE_MASTER_OUTPUT_DIR"),
    },
  },
  async ({ path: inputPath, outDir }) =>
    browserTool(() => runUpscale(inputPath, { outDir }))
);

server.registerTool(
  "background-remover-ai",
  {
    title: "AI 背景扣除",
    description:
      "AI 智能抠图:mode=ai 使用 ISNet 深度学习模型自动识别主体并移除背景;mode=channel 使用 ViTMatte 按颜色通道抠图。输出透明背景 PNG。首次调用会下载模型并缓存。",
    inputSchema: {
      path: z.string().describe("输入图片的本地绝对路径"),
      mode: z.enum(["ai", "channel"]).optional().describe("抠图模式,默认 ai"),
      model: z
        .enum(["isnet", "isnet_fp16", "isnet_quint8"])
        .optional()
        .describe("ai 模式使用的 ISNet 模型,默认 isnet"),
      outDir: z.string().optional().describe("输出目录,默认 IMAGE_MASTER_OUTPUT_DIR"),
    },
  },
  async ({ path: inputPath, mode, model, outDir }) =>
    browserTool(() => runBackgroundRemoveAi(inputPath, { mode, model, outDir }))
);

server.registerTool(
  "inpaint",
  {
    title: "AI 图片修复 (去水印/消除物体)",
    description:
      "使用 MiGAN 深度学习模型修复图片中被标记的区域,可用于去水印、消除物体、修复划痕。用 regions(图片像素坐标的矩形数组)或 maskPath(遮罩图片,标记区域需为不透明/亮色)指定要修复的范围。首次调用会下载约 27MB 模型并缓存。",
    inputSchema: {
      path: z.string().describe("输入图片的本地绝对路径"),
      regions: z
        .array(
          z.object({
            x: z.number().describe("矩形左上角 X(图片像素坐标)"),
            y: z.number().describe("矩形左上角 Y"),
            width: z.number(),
            height: z.number(),
          })
        )
        .optional()
        .describe("需要修复的矩形区域列表"),
      maskPath: z
        .string()
        .optional()
        .describe("遮罩图片路径;标记区域(alpha>128)将被修复。与 regions 二选一"),
      outDir: z.string().optional().describe("输出目录,默认 IMAGE_MASTER_OUTPUT_DIR"),
    },
  },
  async ({ path: inputPath, regions, maskPath, outDir }) =>
    browserTool(() => runInpaint(inputPath, { regions, maskPath, outDir }))
);

const shutdown = async () => {
  await closeBrowser();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.connect(new StdioServerTransport());
