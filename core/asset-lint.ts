import { createHash } from "node:crypto";

/** Everything the linter needs to know about one file. */
export interface LintFile {
  name: string;
  width: number;
  height: number;
  /** Format as reported by the decoder: png, jpeg, webp, ... */
  format: string;
  hasAlpha: boolean;
  bytes: number;
  /** True when every pixel is fully transparent. */
  empty: boolean;
  /** Content hash, used to spot duplicated files. */
  hash: string;
}

export interface LintRules {
  /** Both sides must be a power of two. */
  powerOfTwo: boolean;
  /** Both sides must be divisible by this, e.g. 4 for block compression. */
  multipleOf?: number;
  /** No side may be longer than this. */
  maxSize?: number;
  /** Allowed formats, e.g. ["png", "webp"]. `jpg` is accepted for `jpeg`. */
  formats?: string[];
  /** Whether the image must carry an alpha channel. */
  alpha: "any" | "required" | "forbidden";
  /** Per-file size ceiling. */
  maxKilobytes?: number;
  /** File name must match this regular expression. */
  namePattern?: string;
  /** Treat a fully transparent image as an error instead of a warning. */
  forbidEmpty: boolean;
}

export type LintLevel = "error" | "warning";

export interface LintIssue {
  rule: string;
  level: LintLevel;
  message: string;
}

export interface LintFileReport extends LintFile {
  issues: LintIssue[];
  status: "ok" | "warn" | "error";
}

export interface LintReport {
  rules: LintRules;
  ok: boolean;
  summary: {
    files: number;
    passed: number;
    failed: number;
    warned: number;
    errorCount: number;
    warningCount: number;
    totalBytes: number;
  };
  files: LintFileReport[];
}

/** Extensions we know how to compare against a decoded format. */
const EXTENSION_FORMATS: Record<string, string> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "webp",
  gif: "gif",
  avif: "avif",
  tif: "tiff",
  tiff: "tiff",
  bmp: "bmp",
  heic: "heif",
  heif: "heif",
};

/** `jpg` and `jpeg` are the same format; everything else is lower-cased. */
export function normalizeFormat(format: string): string {
  const lower = format.trim().toLowerCase();
  return lower === "jpg" ? "jpeg" : lower;
}

export function hashBuffer(buffer: Buffer): string {
  return createHash("sha1").update(buffer).digest("hex").slice(0, 16);
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

/** Check one file. `firstByName` remembers who a content hash was seen on. */
export function lintFile(
  file: LintFile,
  rules: LintRules,
  namePattern?: RegExp,
  firstByHash?: Map<string, string>
): LintIssue[] {
  const issues: LintIssue[] = [];
  const size = `${file.width}x${file.height}`;
  const push = (rule: string, level: LintLevel, message: string) =>
    issues.push({ rule, level, message });

  if (rules.powerOfTwo && !(isPowerOfTwo(file.width) && isPowerOfTwo(file.height))) {
    push("powerOfTwo", "error", `${size} 不是 2 的幂`);
  }
  if (rules.multipleOf && rules.multipleOf > 1) {
    if (file.width % rules.multipleOf !== 0 || file.height % rules.multipleOf !== 0) {
      push(
        "multipleOf",
        "error",
        `${size} 不是 ${rules.multipleOf} 的整数倍`
      );
    }
  }
  if (rules.maxSize && Math.max(file.width, file.height) > rules.maxSize) {
    push("maxSize", "error", `${size} 超过最大边长 ${rules.maxSize}`);
  }

  const format = normalizeFormat(file.format);
  if (rules.formats?.length) {
    const allowed = rules.formats.map(normalizeFormat);
    if (!allowed.includes(format)) {
      push(
        "formats",
        "error",
        `格式 ${format} 不在白名单内(${allowed.join(" / ")})`
      );
    }
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  const expected = extension ? EXTENSION_FORMATS[extension] : undefined;
  if (expected && expected !== format) {
    push("extension", "error", `扩展名 .${extension} 与实际格式 ${format} 不符`);
  }

  if (rules.alpha === "required" && !file.hasAlpha) {
    push("alpha", "error", "缺少透明通道(alpha)");
  }
  if (rules.alpha === "forbidden" && file.hasAlpha) {
    push("alpha", "error", "不允许带透明通道(alpha)");
  }

  if (rules.maxKilobytes !== undefined) {
    const kilobytes = file.bytes / 1024;
    if (kilobytes > rules.maxKilobytes) {
      push(
        "maxKilobytes",
        "error",
        `${kilobytes.toFixed(1)} KB 超过上限 ${rules.maxKilobytes} KB`
      );
    }
  }

  if (namePattern && !namePattern.test(file.name)) {
    push("namePattern", "error", `文件名不符合 ${namePattern.source}`);
  }

  if (file.empty) {
    push(
      "empty",
      rules.forbidEmpty ? "error" : "warning",
      "全透明空图,可能导出失败"
    );
  }

  if (firstByHash) {
    const first = firstByHash.get(file.hash);
    if (first && first !== file.name) {
      push("duplicate", "warning", `与 ${first} 内容完全相同`);
    } else if (!first) {
      firstByHash.set(file.hash, file.name);
    }
  }

  return issues;
}

export function lintAssets(files: LintFile[], rules: LintRules): LintReport {
  let namePattern: RegExp | undefined;
  if (rules.namePattern) {
    try {
      namePattern = new RegExp(rules.namePattern);
    } catch (e) {
      throw new Error(`namePattern 不是合法正则:${(e as Error).message}`);
    }
  }

  const firstByHash = new Map<string, string>();
  const reports: LintFileReport[] = files.map((file) => {
    const issues = lintFile(file, rules, namePattern, firstByHash);
    const status = issues.some((issue) => issue.level === "error")
      ? "error"
      : issues.length > 0
        ? "warn"
        : "ok";
    return { ...file, issues, status };
  });

  const errorCount = reports.reduce(
    (total, report) =>
      total + report.issues.filter((issue) => issue.level === "error").length,
    0
  );
  const warningCount = reports.reduce(
    (total, report) =>
      total + report.issues.filter((issue) => issue.level === "warning").length,
    0
  );

  return {
    rules,
    ok: errorCount === 0,
    summary: {
      files: reports.length,
      passed: reports.filter((report) => report.status === "ok").length,
      failed: reports.filter((report) => report.status === "error").length,
      warned: reports.filter(
        (report) => report.issues.some((issue) => issue.level === "warning")
      ).length,
      errorCount,
      warningCount,
      totalBytes: reports.reduce((total, report) => total + report.bytes, 0),
    },
    files: reports,
  };
}