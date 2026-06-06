import { spawn } from "child_process";
import { closeSync, mkdirSync, openSync } from "fs";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type LocalDigitalHumanService = "duix-adapter" | "musetalk-service";

type StartRequest = {
  service?: unknown;
};

const serviceDefs: Record<LocalDigitalHumanService, {
  label: string;
  script: string;
  generateEndpoint: string;
  healthEndpoint: string;
}> = {
  "duix-adapter": {
    label: "Duix Adapter",
    script: "digital-human:duix-adapter",
    generateEndpoint: "http://127.0.0.1:8789/generate",
    healthEndpoint: "http://127.0.0.1:8789/health",
  },
  "musetalk-service": {
    label: "MuseTalk HTTP Service",
    script: "digital-human:musetalk-service",
    generateEndpoint: "http://127.0.0.1:8788/generate",
    healthEndpoint: "http://127.0.0.1:8788/health",
  },
};

const serviceStateDir = path.join(process.cwd(), "data", "digital-human-services");

function normalizeService(value: unknown): LocalDigitalHumanService | null {
  if (value === "duix-adapter" || value === "musetalk-service") return value;
  return null;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function servicePaths(service: LocalDigitalHumanService) {
  return {
    statePath: path.join(serviceStateDir, `${service}.json`),
    stdoutPath: path.join(serviceStateDir, `${service}.out.log`),
    stderrPath: path.join(serviceStateDir, `${service}.err.log`),
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

async function writeServiceState(
  service: LocalDigitalHumanService,
  state: Record<string, unknown>,
) {
  const paths = servicePaths(service);
  await fs.mkdir(serviceStateDir, { recursive: true });
  await fs.writeFile(paths.statePath, JSON.stringify({ ...state, paths }, null, 2), "utf8");
  return paths;
}

export async function POST(request: Request) {
  let body: StartRequest = {};
  try {
    body = await request.json() as StartRequest;
  } catch {
    body = {};
  }

  const service = normalizeService(body.service);
  if (!service) {
    return Response.json(
      {
        started: false,
        error: "Unknown local digital human service. Use duix-adapter or musetalk-service.",
        generatedAt: new Date().toISOString(),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const def = serviceDefs[service];
  const paths = servicePaths(service);
  if (await isHealthy(def.healthEndpoint)) {
    return Response.json(
      {
        started: false,
        alreadyRunning: true,
        service,
        label: def.label,
        generateEndpoint: def.generateEndpoint,
        healthEndpoint: def.healthEndpoint,
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
    child = spawn(npmCommand(), ["run", def.script], {
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
    const message = error instanceof Error ? error.message : `Unable to spawn ${def.label}`;
    return Response.json(
      {
        started: false,
        alreadyRunning: false,
        service,
        label: def.label,
        error: message,
        paths,
        generatedAt: new Date().toISOString(),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const generatedAt = new Date().toISOString();
  await writeServiceState(service, {
    service,
    label: def.label,
    script: def.script,
    pid: child.pid,
    generateEndpoint: def.generateEndpoint,
    healthEndpoint: def.healthEndpoint,
    startedAt: generatedAt,
  });

  return Response.json(
    {
      started: true,
      alreadyRunning: false,
      service,
      label: def.label,
      script: def.script,
      pid: child.pid,
      generateEndpoint: def.generateEndpoint,
      healthEndpoint: def.healthEndpoint,
      paths,
      generatedAt,
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
