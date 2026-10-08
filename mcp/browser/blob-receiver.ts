/**
 * Loopback HTTP receiver used to pull binary results out of the browser page.
 *
 * The browser tools run inside a real page, so the processed image only exists
 * as an in-memory Blob (blob: URL). Playwright download capture proved
 * unreliable for these blob downloads, so instead the page fetches its own
 * blob and POSTs the bytes here. The file is written straight to disk.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

export interface BlobReceiver {
  port: number;
  /** Resolve with the path of the next file posted to the receiver. */
  next(timeoutMs: number): Promise<string>;
  dispose(): Promise<void>;
}

function sanitizeName(raw: string | null): string {
  const base = path.basename(raw || "output.png");
  return base.replace(/[\\/:*?"<>|]/g, "_") || "output.png";
}

export async function startBlobReceiver(dir: string): Promise<BlobReceiver> {
  fs.mkdirSync(dir, { recursive: true });

  let settle: { resolve: (p: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout } | null = null;

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end("method not allowed");
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const name = sanitizeName(url.searchParams.get("name"));
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const target = path.join(dir, name);
      try {
        fs.writeFileSync(target, Buffer.concat(chunks));
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
        settle?.reject(e as Error);
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, name }));
      const pending = settle;
      settle = null;
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(target);
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind blob receiver");
  }

  return {
    port: address.port,
    next(timeoutMs: number): Promise<string> {
      if (settle) return Promise.reject(new Error("blob receiver already waiting"));
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          settle = null;
          reject(new Error("timed out waiting for the browser to send the result"));
        }, timeoutMs);
        settle = { resolve, reject, timer };
      });
    },
    async dispose(): Promise<void> {
      if (settle) {
        clearTimeout(settle.timer);
        settle = null;
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
