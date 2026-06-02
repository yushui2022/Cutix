import { listRenderTasks, updateRenderTask } from "../lib/render-task-store";
import { readRenderTaskPayload } from "../lib/render-task-payload-store";
import { drainRenderTaskStream } from "../lib/render-task-runner";
import { writeWorkerState } from "../lib/worker-state-store";

const origin = process.env.CUTIX_PLATFORM_ORIGIN || "http://127.0.0.1:3000";
const pollIntervalMs = Math.max(1000, Number(process.env.CUTIX_RENDER_WORKER_POLL_MS) || 3000);
const runOnce = process.argv.includes("--once");
const workerId = process.env.CUTIX_RENDER_WORKER_ID || `render-worker-${process.pid}`;
const startedAt = new Date().toISOString();
let processedTasks = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nextQueuedTask() {
  const tasks = await listRenderTasks(100);
  return tasks
    .filter((task) => task.status === "queued" && task.payloadStored)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
}

async function heartbeat(status: "idle" | "processing" | "stopped", currentTaskId?: string) {
  await writeWorkerState({
    id: workerId,
    kind: "render",
    status,
    origin,
    currentTaskId,
    processedTasks,
    startedAt,
    lastHeartbeatAt: new Date().toISOString(),
  });
}

async function processNextTask() {
  const task = await nextQueuedTask();
  if (!task) {
    await heartbeat("idle");
    return false;
  }

  const payload = await readRenderTaskPayload(task.id);
  if (!payload) {
    await updateRenderTask(task.id, {
      status: "failed",
      stage: "Worker 未找到任务 payload",
      error: "Render payload is missing",
      completedAt: new Date().toISOString(),
    });
    processedTasks += 1;
    await heartbeat("idle");
    return true;
  }

  await updateRenderTask(task.id, {
    status: "queued",
    stage: "独立 Worker 已接管",
  });
  console.log(`[render-worker] start ${task.id}`);
  await heartbeat("processing", task.id);
  await drainRenderTaskStream(origin, task.id, payload);
  processedTasks += 1;
  await heartbeat("idle");
  console.log(`[render-worker] done ${task.id}`);
  return true;
}

async function main() {
  console.log(`[render-worker] id=${workerId} origin=${origin} poll=${pollIntervalMs}ms once=${runOnce}`);
  await heartbeat("idle");

  while (true) {
    const processed = await processNextTask();
    if (runOnce) break;
    if (!processed) await sleep(pollIntervalMs);
  }

  await heartbeat("stopped");
}

main().catch((error: unknown) => {
  console.error("[render-worker] fatal", error);
  process.exit(1);
});
