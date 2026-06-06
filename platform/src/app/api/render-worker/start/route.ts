import { listWorkerStates } from "@/lib/worker-state-store";
import { spawn } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function healthyRenderWorkers() {
  return listWorkerStates().then((workers) => {
    const now = Date.now();
    return workers.filter((worker) => {
      const lastHeartbeatAt = Date.parse(worker.lastHeartbeatAt);
      return (
        worker.kind === "render"
        && worker.status !== "stopped"
        && Number.isFinite(lastHeartbeatAt)
        && now - lastHeartbeatAt < 30_000
      );
    });
  });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export async function POST(request: Request) {
  const currentWorkers = await healthyRenderWorkers();
  if (currentWorkers.length > 0) {
    return Response.json(
      {
        started: false,
        alreadyRunning: true,
        workers: currentWorkers,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const workerId = `web-render-worker-${Date.now()}`;
  const origin = new URL(request.url).origin;

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(npmCommand(), ["run", "worker:render"], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        CUTIX_RENDER_WORKER_ID: workerId,
        CUTIX_PLATFORM_ORIGIN: origin,
      },
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to spawn render worker";
    return Response.json(
      {
        started: false,
        alreadyRunning: false,
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
      workerId,
      pid: child.pid,
      origin,
      generatedAt: new Date().toISOString(),
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
