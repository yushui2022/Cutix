import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  claimNextQueuedRenderTask,
  createRenderTask,
  readRenderTask,
  recoverTimedOutRenderTasks,
  releaseRenderTaskLock,
  scheduleRenderTaskRetry,
  updateRenderTask,
} from "../src/lib/render-task-store";

const taskId = `task_selftest_${Date.now()}`;
const queueTaskId = `${taskId}_queue`;
const staleTaskId = `${taskId}_stale`;
const taskIds = [taskId, queueTaskId, staleTaskId];
const taskFiles = taskIds.map((id) => path.join(process.cwd(), "data", "render-tasks", `${id}.json`));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  process.env.CUTIX_RENDER_TASK_RETRY_BASE_MS = "0";
  process.env.CUTIX_RENDER_TASK_RETRY_MAX_MS = "0";

  const created = await createRenderTask({
    id: taskId,
    brandId: "selftest",
    brandName: "Self Test",
    templateId: "default",
    templateName: "Default",
    platform: "test",
  });

  assert.equal(created.stage, "等待渲染");
  assert.ok(created.stageStartedAt);
  assert.equal(created.stageHistory?.length, 1);

  await sleep(10);
  const running = await updateRenderTask(taskId, {
    status: "running",
    stage: "阶段 A",
  });
  assert.equal(running.status, "running");
  assert.ok(running.startedAt);
  assert.equal(running.stageDurations?.length, 1);
  assert.equal(running.stageDurations?.[0]?.stage, "等待渲染");
  assert.equal(running.stageHistory?.length, 2);

  await sleep(10);
  const nextStage = await updateRenderTask(taskId, {
    status: "running",
    stage: "阶段 B",
  });
  assert.equal(nextStage.stageDurations?.length, 2);
  assert.equal(nextStage.stageDurations?.[1]?.stage, "阶段 A");

  await sleep(10);
  const completed = await updateRenderTask(taskId, {
    status: "completed",
    stage: "完成",
    completedAt: new Date().toISOString(),
  });
  assert.equal(completed.stageDurations?.length, 3);
  assert.equal(completed.stageDurations?.[2]?.stage, "阶段 B");
  assert.equal(completed.stageHistory?.length, 4);

  const retried = await updateRenderTask(taskId, {
    status: "queued",
    stage: "等待重试渲染",
    completedAt: undefined,
    resetTiming: true,
  });
  assert.equal(retried.startedAt, undefined);
  assert.deepEqual(retried.stageDurations, []);
  assert.equal(retried.stageHistory?.length, 1);
  assert.equal(retried.stageHistory?.[0]?.stage, "等待重试渲染");

  await sleep(10);
  const resumed = await updateRenderTask(taskId, {
    status: "running",
  });
  assert.equal(resumed.status, "running");
  assert.equal(resumed.stage, "等待重试渲染");
  assert.equal(resumed.stageDurations?.length, 1);
  assert.equal(resumed.stageDurations?.[0]?.stage, "等待重试渲染");
  assert.equal(resumed.stageHistory?.length, 2);
  assert.equal(resumed.stageHistory?.[1]?.status, "running");

  const persisted = await readRenderTask(taskId);
  assert.equal(persisted?.stage, "等待重试渲染");

  await updateRenderTask(taskId, {
    status: "completed",
    stage: "重试验证完成",
    completedAt: new Date().toISOString(),
  });

  await createRenderTask({
    id: queueTaskId,
    brandId: "selftest",
    brandName: "Self Test",
    templateId: "default",
    templateName: "Default",
    platform: "test",
    maxAttempts: 2,
  });
  await updateRenderTask(queueTaskId, {
    stage: "等待 Worker",
    payloadStored: true,
  });
  const claimed = await claimNextQueuedRenderTask("selftest-worker", { leaseMs: 1_000, taskIds: [queueTaskId] });
  assert.equal(claimed?.id, queueTaskId);
  assert.equal(claimed?.status, "running");
  assert.equal(claimed?.attempt, 1);
  assert.equal(claimed?.lockedBy, "selftest-worker");

  await updateRenderTask(queueTaskId, {
    status: "failed",
    stage: "失败",
    error: "boom",
    completedAt: new Date().toISOString(),
  });
  const retry = await scheduleRenderTaskRetry(queueTaskId, "boom");
  assert.equal(retry.retried, true);
  assert.equal(retry.task?.status, "queued");
  assert.equal(retry.task?.lastError, "boom");
  assert.ok(retry.task?.nextRunAt);

  const reclaimed = await claimNextQueuedRenderTask("selftest-worker", { leaseMs: 1_000, taskIds: [queueTaskId] });
  assert.equal(reclaimed?.id, queueTaskId);
  assert.equal(reclaimed?.attempt, 2);
  await updateRenderTask(queueTaskId, {
    status: "failed",
    stage: "再次失败",
    error: "boom again",
    completedAt: new Date().toISOString(),
  });
  const exhausted = await scheduleRenderTaskRetry(queueTaskId, "boom again");
  assert.equal(exhausted.retried, false);

  await createRenderTask({
    id: staleTaskId,
    brandId: "selftest",
    brandName: "Self Test",
    templateId: "default",
    templateName: "Default",
    platform: "test",
    maxAttempts: 2,
  });
  await updateRenderTask(staleTaskId, {
    stage: "等待 Worker",
    payloadStored: true,
  });
  const staleClaim = await claimNextQueuedRenderTask("stale-worker", { leaseMs: 1_000, taskIds: [staleTaskId] });
  assert.equal(staleClaim?.id, staleTaskId);
  await sleep(10);
  const recovered = await recoverTimedOutRenderTasks({ leaseMs: 1, taskIds: [staleTaskId] });
  assert.equal(recovered.requeued, 1);
  const staleRecovered = await readRenderTask(staleTaskId);
  assert.equal(staleRecovered?.status, "queued");
  assert.equal(staleRecovered?.attempt, 1);
  assert.equal(staleRecovered?.lockedBy, undefined);

  console.log("[render-task-store:selftest] 44 checks passed");
}

main()
  .finally(async () => {
    await Promise.all(taskIds.map((id) => releaseRenderTaskLock(id)));
    await Promise.all(taskFiles.map((file) => fs.rm(file, { force: true })));
  })
  .catch((error: unknown) => {
    console.error("[render-task-store:selftest] failed", error);
    process.exitCode = 1;
  });
