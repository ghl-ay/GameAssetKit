/**
 * Image Master MCP Server (stdio).
 *
 * Run: bun mcp/server.ts
 * Every core tool is exposed as an MCP tool that takes a local image path,
 * writes results to the output directory (IMAGE_MASTER_OUTPUT_DIR, default
 * <project>/output) and returns the written file paths as JSON text.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tools } from "../core/registry";

const outputDir =
  process.env.IMAGE_MASTER_OUTPUT_DIR ??
  path.resolve(import.meta.dir, "../output");

const server = new McpServer({
  name: "image-master",
  version: "0.1.0",
});

for (const tool of Object.values(tools)) {
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
        const result = await tool.run(input, params, baseName);

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
      } catch (e) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: (e as Error).message }],
        };
      }
    }
  );
}

await server.connect(new StdioServerTransport());
