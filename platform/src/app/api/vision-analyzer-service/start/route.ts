import { spawn } from "child_process";
import { closeSync, mkdirSync, openSync } from "fs";
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

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function servicePaths() {
  return {
    statePath: path.join(serviceStateDir, "vision-analyzer.json"),
    stdoutPath: path.join(serviceStateDir, "vision-analyzer.out.log"),
    stderrPath: path.join(serviceStateDir, "vision-analyzer.err.log"),
  };
}

async function isHealthy(endpoint: string) {
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null) as { ok?: unknown } | null;
    return payload?.ok === true || response.ok;
  } catch {
    return false;
  }
}

async function writeServiceState(state: Record<string, unknown>) {
  const paths = servicePaths();
  await fs.mkdir(serviceStateDir, { recursive: true });
  await fs.writeFile(paths.statePath, JSON.stringify({ ...state, paths }, null, 2), "utf8");
  return paths;
}

export async function POST() {
  const paths = servicePaths();
  if (await isHealthy(serviceDef.healthEndpoint)) {
    return Response.json(
      {
        started: false,
        alreadyRunning: true,
        label: serviceDef.label,
        analyzeEndpoint: serviceDef.analyzeEndpoint,
        healthEndpoint: serviceDef.healthEndpoint,
        paths,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let child: ReturnType<typeof spawn>;
  let stdoutFd: number | undefined;
  let stderrFd: number | undefined;
  try {
    mkdirSync(serviceStateDir, { recursive: true });
    stdoutFd = openSync(paths.stdoutPath, "a");
    stderrFd = openSync(paths.stderrPath, "a");
    child = spawn(npmCommand(), ["run", serviceDef.script], {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: ["ignore", stdoutFd, stderrFd],
      windowsHide: true,
    });
    child.unref();
    closeSync(stdoutFd);
    closeSync(stderrFd);
    stdoutFd = undefined;
    stderrFd = undefined;
  } catch (error: unknown) {
    if (stdoutFd !== undefined) closeSync(stdoutFd);
    if (stderrFd !== undefined) closeSync(stderrFd);
    return Response.json(
      {
        started: false,
        alreadyRunning: false,
        label: serviceDef.label,
        error: error instanceof Error ? error.message : "Unable to spawn Vision Analyzer",
        paths,
        generatedAt: new Date().toISOString(),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const generatedAt = new Date().toISOString();
  await writeServiceState({
    label: serviceDef.label,
    script: serviceDef.script,
    pid: child.pid,
    analyzeEndpoint: serviceDef.analyzeEndpoint,
    healthEndpoint: serviceDef.healthEndpoint,
    startedAt: generatedAt,
  });

  return Response.json(
    {
      started: true,
      alreadyRunning: false,
      label: serviceDef.label,
      script: serviceDef.script,
      pid: child.pid,
      analyzeEndpoint: serviceDef.analyzeEndpoint,
      healthEndpoint: serviceDef.healthEndpoint,
      paths,
      generatedAt,
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
