import { spawn } from "child_process";

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

function normalizeService(value: unknown): LocalDigitalHumanService | null {
  if (value === "duix-adapter" || value === "musetalk-service") return value;
  return null;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
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
  if (await isHealthy(def.healthEndpoint)) {
    return Response.json(
      {
        started: false,
        alreadyRunning: true,
        service,
        label: def.label,
        generateEndpoint: def.generateEndpoint,
        healthEndpoint: def.healthEndpoint,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(npmCommand(), ["run", def.script], {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : `Unable to spawn ${def.label}`;
    return Response.json(
      {
        started: false,
        alreadyRunning: false,
        service,
        label: def.label,
        error: message,
        generatedAt: new Date().toISOString(),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

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
      generatedAt: new Date().toISOString(),
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
