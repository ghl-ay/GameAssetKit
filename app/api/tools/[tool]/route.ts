import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { getTool, runTool, parseToolParams } from "../../../../core/registry";
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
    params: z.toJSONSchema(z.object(tool.params)),
  });
}

/**
 * POST /api/tools/{tool} — run a tool.
 * Accepts multipart/form-data (fields: file, options as JSON string)
 * or application/json ({ image_base64, name?, options? }).
 * Returns the processed image; multi-image results come back as a zip.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool: name } = await params;
  if (!getTool(name)) {
    return errorResponse(
      `Unknown tool: ${name}. See GET /api/tools for the list.`,
      404
    );
  }

  let input: Buffer;
  let baseName = "image";
  let rawOptions: unknown = {};

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return errorResponse("multipart/form-data requires a 'file' field", 400);
      }
      input = Buffer.from(await file.arrayBuffer());
      baseName = file.name.replace(/\.[^/.]+$/, "") || "image";
      const optRaw = form.get("options");
      if (typeof optRaw === "string" && optRaw.trim()) {
        rawOptions = JSON.parse(optRaw);
      }
    } else {
      const body = await req.json();
      if (typeof body.image_base64 !== "string") {
        return errorResponse(
          "JSON body requires 'image_base64' (base64-encoded image)",
          400
        );
      }
      input = Buffer.from(body.image_base64, "base64");
      if (typeof body.name === "string" && body.name) {
        baseName = body.name.replace(/\.[^/.]+$/, "");
      }
      rawOptions = body.options ?? {};
    }
  } catch (e) {
    return errorResponse(`Invalid request body: ${(e as Error).message}`, 400);
  }

  try {
    // Validate params up front so schema errors surface before processing.
    parseToolParams(getTool(name)!, rawOptions);
  } catch (e) {
    return errorResponse(`Invalid options: ${(e as Error).message}`, 400);
  }

  try {
    const result = await runTool(name, input, rawOptions, baseName);

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
