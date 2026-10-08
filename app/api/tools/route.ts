import { NextResponse } from "next/server";
import { z } from "zod";
import { listTools } from "../../../core/registry";

export const runtime = "nodejs";

/** GET /api/tools — list all available tools with their parameter schemas. */
export async function GET() {
  return NextResponse.json({
    tools: listTools().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      params: z.toJSONSchema(z.object(tool.params)),
    })),
    usage: {
      endpoint: "/api/tools/{tool}",
      multipart: "POST multipart/form-data, fields: file=<binary>, options=<JSON string>",
      json: 'POST application/json, body: { "image_base64": "...", "name": "optional.png", "options": { ... } }',
      multi_output: "Tools returning multiple images (sprite-splitter) respond with a .zip file",
    },
  });
}
