import fs from "fs/promises";
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

const benchmarkDir = path.join(process.cwd(), "data", "digital-human", "benchmarks");

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
