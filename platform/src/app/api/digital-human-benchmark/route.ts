import fs from "fs/promises";
import { spawn } from "child_process";
import crypto from "crypto";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BenchmarkSummary = {
  count?: unknown;
  passed?: unknown;
  failed?: unknown;
  successRate?: unknown;
  averageElapsedMs?: unknown;
  p95ElapsedMs?: unknown;
  maxElapsedMs?: unknown;
  totalOutputBytes?: unknown;
};

type BenchmarkReport = {
  createdAt?: unknown;
  endpoint?: unknown;
  provider?: unknown;
  health?: {
    status?: unknown;
    message?: unknown;
  };
  summary?: BenchmarkSummary;
};

type StoredDigitalHumanConfig = {
  provider?: unknown;
  endpoint?: unknown;
  avatarPath?: unknown;
  apiKey?: unknown;
};

type BenchmarkStartRequest = {
  endpoint?: unknown;
  audioUrl?: unknown;
  audioPath?: unknown;
  avatarPath?: unknown;
  text?: unknown;
  count?: unknown;
  durationMs?: unknown;
  allowUnhealthy?: unknown;
  brand?: {
    id?: unknown;
    name?: unknown;
    digitalHuman?: {
      roleName?: unknown;
      avatarPath?: unknown;
      voiceId?: unknown;
    };
  };
  roleName?: unknown;
  voiceId?: unknown;
};

const benchmarkDir = path.join(process.cwd(), "data", "digital-human", "benchmarks");
const configFile = path.join(process.cwd(), "data", "digital-human-config.json");
const publicDir = path.join(process.cwd(), "public");
const benchmarkScript = path.join(process.cwd(), "scripts", "digital-human-benchmark.mjs");

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function healthStatus(value: unknown): "pass" | "warn" | "fail" | "unknown" {
  if (value === "pass" || value === "warn" || value === "fail") return value;
  return "unknown";
}

function asStartRequest(value: unknown): BenchmarkStartRequest {
  return typeof value === "object" && value !== null ? value as BenchmarkStartRequest : {};
}

function normalizedCount(value: unknown) {
  return Math.min(20, Math.max(1, Math.floor(number(value, 3))));
}

function normalizedDurationMs(value: unknown) {
  return Math.min(120_000, Math.max(100, Math.floor(number(value, 5000))));
}

function isInsidePath(candidate: string, parent: string) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function publicUrlToPath(value: string) {
  if (!value.startsWith("/output/") && !value.startsWith("/uploads/")) return "";
  const resolved = path.resolve(publicDir, value.replace(/^\/+/, ""));
  return isInsidePath(resolved, publicDir) ? resolved : "";
}

function publicAudioPathFromBody(body: BenchmarkStartRequest) {
  const audioUrl = text(body.audioUrl);
  const audioUrlPath = audioUrl ? publicUrlToPath(audioUrl) : "";
  if (audioUrlPath) return audioUrlPath;

  const audioPath = text(body.audioPath);
  if (!audioPath) return "";
  const resolved = path.resolve(audioPath);
  return isInsidePath(resolved, publicDir) ? resolved : "";
}

function validUrl(value: string) {
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

async function readConfig(): Promise<StoredDigitalHumanConfig> {
  try {
    const parsed = JSON.parse(await fs.readFile(configFile, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed as StoredDigitalHumanConfig : {};
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function readJsonFile(filePath: string): Promise<BenchmarkReport | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed as BenchmarkReport : null;
  } catch {
    return null;
  }
}

async function listReportFiles(limit: number) {
  let entries;
  try {
    entries = await fs.readdir(benchmarkDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const filePath = path.join(benchmarkDir, entry.name);
        try {
          const stat = await fs.stat(filePath);
          return { fileName: entry.name, filePath, mtimeMs: stat.mtimeMs, bytes: stat.size };
        } catch {
          return null;
        }
      }),
  );

  return files
    .filter((file): file is NonNullable<typeof file> => Boolean(file))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
}

function normalizeReport(file: Awaited<ReturnType<typeof listReportFiles>>[number], report: BenchmarkReport) {
  const summary = report.summary ?? {};
  const createdAt = text(report.createdAt, new Date(file.mtimeMs).toISOString());
  return {
    fileName: file.fileName,
    path: file.filePath,
    bytes: file.bytes,
    createdAt,
    endpoint: text(report.endpoint),
    provider: text(report.provider, "unknown"),
    healthStatus: healthStatus(report.health?.status),
    healthMessage: text(report.health?.message),
    summary: {
      count: number(summary.count),
      passed: number(summary.passed),
      failed: number(summary.failed),
      successRate: number(summary.successRate),
      averageElapsedMs: number(summary.averageElapsedMs),
      p95ElapsedMs: number(summary.p95ElapsedMs),
      maxElapsedMs: number(summary.maxElapsedMs),
      totalOutputBytes: number(summary.totalOutputBytes),
    },
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, number(url.searchParams.get("limit"), 10)));
  const files = await listReportFiles(limit);
  const reports = [];

  for (const file of files) {
    const report = await readJsonFile(file.filePath);
    if (!report) continue;
    reports.push(normalizeReport(file, report));
  }

  return Response.json(
    {
      reports,
      reportDir: benchmarkDir,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const body = asStartRequest(await request.json());
  const config = await readConfig();

  const endpoint = validUrl(text(body.endpoint, text(config.endpoint)));
  if (!endpoint) {
    return Response.json({ error: "No valid digital human endpoint configured" }, { status: 400 });
  }

  const audioPath = publicAudioPathFromBody(body);
  if (!audioPath) {
    return Response.json(
      { error: "audioUrl or audioPath must point to /output or /uploads under platform/public" },
      { status: 400 },
    );
  }

  try {
    await fs.access(audioPath);
    await fs.access(benchmarkScript);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Required file is not readable";
    return Response.json({ error: message }, { status: 400 });
  }

  const count = normalizedCount(body.count);
  const durationMs = normalizedDurationMs(body.durationMs);
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const reportPath = path.join(benchmarkDir, `benchmark-web-${runId}.json`);
  const avatarPath =
    text(body.avatarPath)
    || text(body.brand?.digitalHuman?.avatarPath)
    || text(config.avatarPath);
  const roleName = text(body.roleName, text(body.brand?.digitalHuman?.roleName, "Cutix 本地数字人验收角色"));
  const voiceId = text(body.voiceId, text(body.brand?.digitalHuman?.voiceId, "benchmark"));
  const brandId = text(body.brand?.id, "benchmark");
  const brandName = text(body.brand?.name, "Cutix Benchmark");
  const scriptArgs = [
    benchmarkScript,
    "--endpoint",
    endpoint,
    "--audio",
    audioPath,
    "--count",
    String(count),
    "--duration-ms",
    String(durationMs),
    "--brand-id",
    brandId,
    "--brand-name",
    brandName,
    "--role-name",
    roleName,
    "--voice-id",
    voiceId,
    "--text",
    text(body.text, "Cutix Web 本地数字人压测。"),
    "--out",
    reportPath,
  ];

  if (avatarPath) scriptArgs.push("--avatar", avatarPath);
  if (body.allowUnhealthy === true) scriptArgs.push("--allow-unhealthy");

  const child = spawn(process.execPath, scriptArgs, {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      DIGITAL_HUMAN_BENCH_API_KEY: text(config.apiKey),
    },
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  return Response.json(
    {
      started: true,
      pid: child.pid,
      reportPath,
      count,
      endpoint,
      audioPath,
      avatarPath,
      generatedAt: new Date().toISOString(),
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
