import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type LocalDigitalHumanService = "duix-adapter" | "musetalk-service";

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

function servicePaths(service: LocalDigitalHumanService) {
  return {
    statePath: path.join(serviceStateDir, `${service}.json`),
    stdoutPath: path.join(serviceStateDir, `${service}.out.log`),
    stderrPath: path.join(serviceStateDir, `${service}.err.log`),
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
  const services = await Promise.all(
    (Object.keys(serviceDefs) as LocalDigitalHumanService[]).map(async (service) => {
      const def = serviceDefs[service];
      const paths = servicePaths(service);
      const [health, state, stdoutTail, stderrTail] = await Promise.all([
        serviceHealth(def.healthEndpoint),
        readJsonFile(paths.statePath),
        readTail(paths.stdoutPath),
        readTail(paths.stderrPath),
      ]);

      return {
        service,
        label: def.label,
        script: def.script,
        generateEndpoint: def.generateEndpoint,
        healthEndpoint: def.healthEndpoint,
        healthy: health.healthy,
        httpStatus: "httpStatus" in health ? health.httpStatus : undefined,
        healthError: "error" in health ? health.error : "",
        checks: health.checks,
        state,
        paths,
        stdoutTail,
        stderrTail,
      };
    }),
  );

  return Response.json(
    {
      services,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
