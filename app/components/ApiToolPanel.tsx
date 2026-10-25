"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiTool, type ApiToolOption } from "../lib/api-tools";
import { TOOLS } from "../types";
import { DropdownMenu } from "./DropdownMenu";
import { ImageLightbox } from "./ImageLightbox";
import { useFileTransfer } from "./FileTransferProvider";

interface OutputFile {
  name: string;
  blob: Blob;
  url: string;
  kind: "image" | "json" | "other";
  text?: string;
}

export interface ApiToolPanelProps {
  toolKey: string;
  description?: string;
  onHasFilesChange?: (hasFiles: boolean) => void;
}

type Values = Record<string, string | boolean>;

function initialValues(options: ApiToolOption[]): Values {
  const values: Values = {};
  for (const option of options) {
    if (option.kind === "boolean") {
      values[option.name] = option.defaultValue === true;
    } else if (option.kind === "number" || option.kind === "enum") {
      values[option.name] = option.defaultValue === undefined ? "" : String(option.defaultValue);
    } else {
      values[option.name] = "";
    }
  }
  return values;
}

/** Turn the form state into the `options` JSON the API expects. */
function buildOptions(options: ApiToolOption[], values: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const option of options) {
    const raw = values[option.name];
    if (option.kind === "boolean") {
      out[option.name] = raw === true;
      continue;
    }
    if (typeof raw !== "string" || raw.trim() === "") continue;

    if (option.kind === "number") {
      const value = Number(raw);
      if (Number.isFinite(value)) out[option.name] = value;
    } else if (option.kind === "enum" || option.kind === "text") {
      out[option.name] = raw.trim();
    } else if (option.kind === "list") {
      out[option.name] = raw
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (option.kind === "colorPairs") {
      out[option.name] = raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [from, to] = line.split(/\s+/);
          return { from, to: to ?? from };
        });
    }
  }
  return out;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fileNameFrom(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  // RFC 5987 encoded name carries non-ASCII (Chinese) file names intact.
  const encoded = /filename\*=(?:utf-8|UTF-8)''([^;]+)/.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // malformed encoding: fall back to the plain filename below
    }
  }
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallback;
}

function guessKind(name: string, contentType: string): OutputFile["kind"] {
  if (contentType.includes("json") || name.endsWith(".json")) return "json";
  if (contentType.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(name)) {
    return "image";
  }
  return "other";
}

interface LintReportShape {
  ok?: boolean;
  summary?: {
    files?: number;
    failed?: number;
    warned?: number;
    errorCount?: number;
    warningCount?: number;
    totalBytes?: number;
  };
  files?: Array<{
    name: string;
    width?: number;
    height?: number;
    status?: string;
    issues?: Array<{ rule: string; level: string; message: string }>;
  }>;
}

/** Renders an asset-lint style report; falls back to pretty JSON for anything else. */
function JsonOutput({ text }: { text: string }) {
  let report: LintReportShape | null = null;
  try {
    const parsed = JSON.parse(text) as LintReportShape;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.files) && parsed.summary) {
      report = parsed;
    }
  } catch {
    report = null;
  }

  if (!report) {
    return (
      <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">
        {text}
      </pre>
    );
  }

  const summary = report.summary ?? {};
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            report.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
          }`}
        >
          {report.ok ? "通过" : "未通过"}
        </span>
        <span className="text-zinc-400">
          {summary.files ?? 0} 个文件 · {summary.errorCount ?? 0} 个错误 ·{" "}
          {summary.warningCount ?? 0} 个警告
          {summary.totalBytes !== undefined ? ` · 共 ${humanSize(summary.totalBytes)}` : ""}
        </span>
      </div>
      <div className="max-h-72 overflow-auto rounded-lg border border-zinc-800">
        {(report.files ?? []).map((file) => (
          <div
            key={file.name}
            className="flex flex-wrap items-baseline gap-x-2 border-b border-zinc-800/60 px-3 py-2 text-xs last:border-b-0"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                file.status === "error"
                  ? "bg-red-500"
                  : file.status === "warn"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />
            <span className="font-mono text-zinc-300">{file.name}</span>
            {file.width !== undefined && (
              <span className="text-zinc-500">
                {file.width}x{file.height}
              </span>
            )}
            <span className="text-zinc-500">
              {(file.issues ?? []).map((issue) => issue.message).join("；")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApiToolPanel({ toolKey, description, onHasFilesChange }: ApiToolPanelProps) {
  const config = getApiTool(toolKey);
  const { pendingTransfer, sendTo, consumeTransfer } = useFileTransfer();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [values, setValues] = useState<Values>(() => initialValues(config?.options ?? []));
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [error, setError] = useState("");
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [zipUrl, setZipUrl] = useState("");
  const [zipName, setZipName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<OutputFile | null>(null);

  const urlsRef = useRef<string[]>([]);
  const trackUrl = useCallback((url: string) => {
    urlsRef.current.push(url);
    return url;
  }, []);

  const clearOutputs = useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current = [];
    setOutputs([]);
    setZipUrl("");
    setZipName("");
  }, []);

  useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
    },
    []
  );

  const maxInputs = config?.maxInputs ?? (config?.inputs === "multiple" ? Number.MAX_SAFE_INTEGER : 1);
  const minInputs = config?.inputs === "multiple" ? (config?.minInputs ?? 2) : 1;

  const adoptFiles = useCallback(
    (incoming: File[]) => {
      setFiles(incoming.slice(0, maxInputs));
      clearOutputs();
      setError("");
      setStatus("idle");
    },
    [clearOutputs, maxInputs]
  );

  // Files handed over from another tool. A transfer that this panel just
  // produced has to stay untouched for the target page, otherwise the sender
  // would swallow it before the navigation completes (same rule as ToolPageWrapper).
  useEffect(() => {
    if (!pendingTransfer || pendingTransfer.fromModule === toolKey) return;
    adoptFiles(pendingTransfer.files);
    consumeTransfer();
  }, [pendingTransfer, adoptFiles, consumeTransfer, toolKey]);

  useEffect(() => {
    onHasFilesChange?.(files.length > 0);
  }, [files.length, onHasFilesChange]);

  const handlePicked = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    adoptFiles(Array.from(picked));
  };

  const run = async () => {
    if (!config) return;
    if (files.length < minInputs) {
      setError(`至少需要 ${minInputs} 个文件`);
      return;
    }

    setStatus("running");
    setError("");
    clearOutputs();

    try {
      const form = new FormData();
      for (const file of files) form.append("file", file, file.name);
      form.append("options", JSON.stringify(buildOptions(config.options, values)));

      const response = await fetch(`/api/tools/${config.apiTool}`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        let message = `${response.status} ${response.statusText}`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // not JSON: keep the status text
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("content-type") ?? "";
      const name = fileNameFrom(response, `${config.apiTool}-output`);

      if (contentType.includes("application/zip")) {
        const blob = await response.blob();
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(blob);
        const entries = Object.values(zip.files).filter((entry) => !entry.dir);
        const collected: OutputFile[] = [];
        for (const entry of entries) {
          const entryBlob = await entry.async("blob");
          const kind = guessKind(entry.name, entryBlob.type);
          collected.push({
            name: entry.name,
            blob: entryBlob,
            url: trackUrl(URL.createObjectURL(entryBlob)),
            kind,
            text: kind === "json" ? await entryBlob.text() : undefined,
          });
        }
        collected.sort((a, b) => (a.kind === "json" ? 1 : 0) - (b.kind === "json" ? 1 : 0));
        setOutputs(collected);
        setZipUrl(trackUrl(URL.createObjectURL(blob)));
        setZipName(fileNameFrom(response, `${config.apiTool}.zip`));
      } else if (contentType.includes("application/json")) {
        const text = await response.text();
        const blob = new Blob([text], { type: "application/json" });
        setOutputs([
          { name, blob, url: trackUrl(URL.createObjectURL(blob)), kind: "json", text },
        ]);
      } else {
        const blob = await response.blob();
        setOutputs([
          {
            name,
            blob,
            url: trackUrl(URL.createObjectURL(blob)),
            kind: guessKind(name, contentType),
          },
        ]);
      }

      setStatus("done");
    } catch (e) {
      setError((e as Error).message);
      setStatus("idle");
    }
  };

  const imageFiles = outputs
    .filter((output) => output.kind === "image")
    .map((output) => new File([output.blob], output.name, { type: output.blob.type || "image/png" }));

  // 序列帧一类的大量图片输出改用缩略图网格,避免竖排几十上百个大预览。
  const imageOutputs = outputs.filter((output) => output.kind === "image");
  const otherOutputs = outputs.filter((output) => output.kind !== "image");
  const useGrid = imageOutputs.length > 12;

  if (!config) {
    return (
      <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-6 text-sm text-red-300">
        未知工具配置:{toolKey}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept={config.accept ?? "image/*"}
        multiple={config.inputs === "multiple"}
        className="hidden"
        onChange={(event) => {
          handlePicked(event.target.files);
          event.target.value = "";
        }}
      />

      {files.length === 0 ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handlePicked(event.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-emerald-500/60 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <p className="mb-1 text-sm text-zinc-300">
            {config.inputs === "multiple"
              ? `点击或拖拽上传 ${config.minInputs ?? 2} 张以上图片`
              : config.accept?.startsWith("video")
                ? "点击或拖拽上传视频"
                : "点击或拖拽上传图片"}
          </p>
          <p className="text-xs text-zinc-500">{description ?? config.description}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-zinc-400">
              已选择 {files.length} 个文件
              {config.inputs === "multiple" ? `(至少 ${minInputs} 个)` : ""}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                {config.inputs === "multiple" ? "重新选择" : "更换图片"}
              </button>
              <button
                onClick={() => adoptFiles([])}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                清空
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((file) => (
              <span
                key={`${file.name}-${file.lastModified}`}
                className="rounded-lg bg-zinc-800/80 px-2 py-1 text-xs text-zinc-400"
              >
                <span className="font-mono">{file.name}</span>
                <span className="ml-2 text-zinc-500">{humanSize(file.size)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {config.options.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {config.options.map((option) => {
              const value = values[option.name];
              const field =
                option.kind === "boolean" ? (
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={value === true}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [option.name]: event.target.checked }))
                      }
                      className="h-4 w-4 accent-emerald-500"
                    />
                    {option.label}
                  </label>
                ) : option.kind === "enum" ? (
                  <select
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [option.name]: event.target.value }))
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                  >
                    <option value="">默认</option>
                    {(option.choices ?? []).map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                ) : option.kind === "list" || option.kind === "colorPairs" ? (
                  <textarea
                    rows={2}
                    value={typeof value === "string" ? value : ""}
                    placeholder={option.placeholder}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [option.name]: event.target.value }))
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200"
                  />
                ) : (
                  <input
                    type={option.kind === "number" ? "number" : "text"}
                    value={typeof value === "string" ? value : ""}
                    min={option.min}
                    max={option.max}
                    step={option.step}
                    placeholder={option.placeholder}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [option.name]: event.target.value }))
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                  />
                );

              return (
                <div key={option.name} className="space-y-1">
                  {option.kind !== "boolean" && (
                    <label className="block text-xs text-zinc-400">{option.label}</label>
                  )}
                  {field}
                  {option.help && <p className="text-xs text-zinc-600">{option.help}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={status === "running" || files.length < minInputs}
          className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {status === "running" ? "处理中…" : "开始处理"}
        </button>
        {config.note && <span className="text-xs text-zinc-500">{config.note}</span>}
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {outputs.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-zinc-300">
              结果 · {outputs.length} 个文件
              {outputs.reduce((total, output) => total + output.blob.size, 0) > 0
                ? ` · ${humanSize(outputs.reduce((total, output) => total + output.blob.size, 0))}`
                : ""}
            </span>
            <div className="flex items-center gap-2">
              {zipUrl && (
                <a
                  href={zipUrl}
                  download={zipName || `${config.apiTool}.zip`}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-emerald-500"
                >
                  下载全部 (ZIP)
                </a>
              )}
              {imageFiles.length > 0 && (
                <DropdownMenu
                  items={[
                    {
                      label: "发送到当前工具",
                      onClick: () => adoptFiles(imageFiles),
                    },
                    ...TOOLS.filter((tool) => tool.key !== toolKey).map((tool) => ({
                      label: `发送到${tool.name}`,
                      onClick: () => sendTo(tool.key, imageFiles, toolKey),
                    })),
                  ]}
                />
              )}
            </div>
          </div>

          {useGrid && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {imageOutputs.map((output) => (
                <button
                  key={output.name}
                  type="button"
                  title={`${output.name} · ${humanSize(output.blob.size)}`}
                  onClick={() => setLightbox(output)}
                  className="overflow-hidden rounded-lg bg-[repeating-conic-gradient(#27272a_0%_25%,#18181b_0%_50%)] bg-[length:16px_16px] transition-opacity hover:opacity-80"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={output.url}
                    alt={output.name}
                    loading="lazy"
                    className="aspect-square w-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}

          <div className={useGrid ? "mt-3 space-y-3" : "space-y-3"}>
            {(useGrid ? otherOutputs : outputs).map((output) => (
              <div key={output.name} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-zinc-300">{output.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-zinc-500">{humanSize(output.blob.size)}</span>
                    <a
                      href={output.url}
                      download={output.name}
                      className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
                    >
                      下载
                    </a>
                  </div>
                </div>
                {output.kind === "image" && (
                  <div className="flex justify-center rounded-lg bg-[repeating-conic-gradient(#27272a_0%_25%,#18181b_0%_50%)] bg-[length:16px_16px] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={output.url}
                      alt={output.name}
                      className="max-h-48 max-w-full object-contain"
                    />
                  </div>
                )}
                {output.kind === "json" && output.text && <JsonOutput text={output.text} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <ImageLightbox src={lightbox.url} alt={lightbox.name} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}