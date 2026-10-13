import { NextResponse } from "next/server";
import { z } from "zod";
import { isMultiTool, listTools } from "../../../core/registry";

export const runtime = "nodejs";

/** GET /api/tools — list all available tools with their parameter schemas. */
export async function GET() {
  return NextResponse.json({
    tools: listTools().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      multiInput: isMultiTool(tool),
      params: z.toJSONSchema(z.object(tool.params)),
    })),
    usage: {
      endpoint: "/api/tools/{tool}",
      multipart:
        "POST multipart/form-data, fields: file=<binary> (repeat the 'file' field for multi-input tools such as atlas-packer), options=<JSON string>",
      json: 'POST application/json, body: { "image_base64": "...", "name": "optional.png", "options": { ... } } — or { "images_base64": ["..."], "names": ["a.png", "b.png"], "options": { ... } } for multi-input tools',
      multi_output:
        "Tools returning several files (sprite-splitter, atlas-packer) respond with a .zip file",
    },
  });
}