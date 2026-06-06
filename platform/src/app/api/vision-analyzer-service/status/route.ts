import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const serviceDef = {
  label: "Vision Analyzer",
  script: "vision:analyzer-service",
  analyzeEndpoint: "http://127.0.0.1:8890/analyze",
  healthEndpoint: "http://127.0.0.1:8890/health",
};

const serviceStateDir = path.join(process.cwd(), "data", "vision-analyzer-service");

function servicePaths() {
  return {
    statePath: path.join(serviceStateDir, "vision-analyzer.json"),
    stdoutPath: path.join(serviceStateDir, "vision-analyzer.out.log"),
    stderrPath: path.join(serviceStateDir, "vision-analyzer.err.log"),
  };
}

async function readJsonFile(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readTail(filePath: string, maxBytes = 3000) {
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    const stat = await fs.stat(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const buffer = Buffer.alloc(length);
    handle = await fs.open(filePath, "r");
    await handle.read(buffer, 0, length, start);
    return buffer.toString("utf8").trim();
  } catch {
    return "";
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function serviceHealth(endpoint: string) {
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    const payload = await response.json().catch(() => null) as { ok?: unknown; checks?: unknown } | null;
    return {
      healthy: response.ok && (payload?.ok === true || payload?.ok === undefined),
      httpStatus: response.status,
      checks: Array.isArray(payload?.checks) ? payload.checks : [],
    };
  } catch (error: unknown) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Unable to reach service health endpoint",
      checks: [],
    };
  }
}

export async function GET() {
  const paths = servicePaths();
  const [health, state, stdoutTail, stderrTail] = await Promise.all([
    serviceHealth(serviceDef.healthEndpoint),
    readJsonFile(paths.statePath),
    readTail(paths.stdoutPath),
    readTail(paths.stderrPath),
  ]);

  return Response.json(
    {
      service: "vision-analyzer",
      label: serviceDef.label,
      script: serviceDef.script,
      analyzeEndpoint: serviceDef.analyzeEndpoint,
      healthEndpoint: serviceDef.healthEndpoint,
      healthy: health.healthy,
      httpStatus: "httpStatus" in health ? health.httpStatus : undefined,
      healthError: "error" in health ? health.error : "",
      checks: health.checks,
      state,
      paths,
      stdoutTail,
      stderrTail,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
