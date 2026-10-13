import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import {
  getTool,
  isMultiTool,
  runTool,
  parseToolParams,
  type ToolInput,
} from "../../../../core/registry";
import type { ImageResult } from "../../../../core/types";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** GET /api/tools/{tool} — describe a single tool. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool: name } = await params;
  const tool = getTool(name);
  if (!tool) {
    return errorResponse(`Unknown tool: ${name}`, 404);
  }
  return NextResponse.json({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    multiInput: isMultiTool(tool),
    params: z.toJSONSchema(z.object(tool.params)),
  });
}

/**
 * POST /api/tools/{tool} — run a tool.
 * Accepts multipart/form-data (field: file, repeat it for multi-input tools;
 * plus options as a JSON string) or application/json
 * ({ image_base64, name?, options? } — or { images_base64: [...], names?: [...] }
 * for multi-input tools).
 * Returns the processed image; multi-file results come back as a zip.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool: name } = await params;
  const tool = getTool(name);
  if (!tool) {
    return errorResponse(
      `Unknown tool: ${name}. See GET /api/tools for the list.`,
      404
    );
  }
  const multi = isMultiTool(tool);

  let inputs: ToolInput[] = [];
  let rawOptions: unknown = {};

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const files = form
        .getAll("file")
        .filter((entry): entry is File => entry instanceof File);
      if (files.length === 0) {
        return errorResponse("multipart/form-data requires a 'file' field", 400);
      }
      inputs = await Promise.all(
        files.map(async (file) => ({
          name: file.name || "image.png",
          buffer: Buffer.from(await file.arrayBuffer()),
        }))
      );
      const optRaw = form.get("options");
      if (typeof optRaw === "string" && optRaw.trim()) {
        rawOptions = JSON.parse(optRaw);
      }
    } else {
      const body = await req.json();
      if (Array.isArray(body.images_base64)) {
        const names: string[] = Array.isArray(body.names) ? body.names : [];
        inputs = body.images_base64.map((data: string, index: number) => ({
          name:
            typeof names[index] === "string" && names[index]
              ? names[index]
              : `image_${index + 1}.png`,
          buffer: Buffer.from(data, "base64"),
        }));
      } else if (typeof body.image_base64 === "string") {
        inputs = [
          {
            name: typeof body.name === "string" && body.name ? body.name : "image.png",
            buffer: Buffer.from(body.image_base64, "base64"),
          },
        ];
      } else {
        return errorResponse(
          "JSON body requires 'image_base64' or 'images_base64' (base64-encoded images)",
          400
        );
      }
      rawOptions = body.options ?? {};
    }
  } catch (e) {
    return errorResponse(`Invalid request body: ${(e as Error).message}`, 400);
  }

  const minInputs = isMultiTool(tool) ? (tool.minInputs ?? 2) : 1;
  if (multi ? inputs.length < minInputs : inputs.length !== 1) {
    return errorResponse(
      multi
        ? `Tool ${name} needs at least ${minInputs} input images`
        : `Tool ${name} takes exactly one input image`,
      400
    );
  }

  try {
    // Validate params up front so schema errors surface before processing.
    parseToolParams(tool, rawOptions);
  } catch (e) {
    return errorResponse(`Invalid options: ${(e as Error).message}`, 400);
  }

  const baseName = inputs[0].name.replace(/\.[^/.]+$/, "") || "image";

  try {
    const result = await runTool(
      name,
      multi ? inputs : inputs[0].buffer,
      rawOptions,
      baseName
    );

    if (Array.isArray(result)) {
      if (result.length === 0) {
        return errorResponse("No output produced (e.g. no sprites found)", 422);
      }
      const zip = new JSZip();
      for (const file of result) {
        zip.file(file.name, file.buffer);
      }
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${baseName}_${name}.zip"`,
          "X-File-Count": String(result.length),
        },
      });
    }

    return imageResponse(result);
  } catch (e) {
    return errorResponse(`Processing failed: ${(e as Error).message}`, 500);
  }
}

function imageResponse(result: ImageResult) {
  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Content-Disposition": `inline; filename="${result.name}"`,
  };
  if (result.width !== undefined) headers["X-Image-Width"] = String(result.width);
  if (result.height !== undefined) headers["X-Image-Height"] = String(result.height);
  if (result.originalWidth !== undefined)
    headers["X-Original-Width"] = String(result.originalWidth);
  if (result.originalHeight !== undefined)
    headers["X-Original-Height"] = String(result.originalHeight);
  return new NextResponse(new Uint8Array(result.buffer), { headers });
}
