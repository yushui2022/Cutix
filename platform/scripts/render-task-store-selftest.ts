import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRenderTask, readRenderTask, updateRenderTask } from "../src/lib/render-task-store";

const taskId = `task_selftest_${Date.now()}`;
const taskFile = path.join(process.cwd(), "data", "render-tasks", `${taskId}.json`);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
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

  console.log("[render-task-store:selftest] 18 checks passed");
}

main()
  .finally(async () => {
    await fs.rm(taskFile, { force: true });
  })
  .catch((error: unknown) => {
    console.error("[render-task-store:selftest] failed", error);
    process.exitCode = 1;
  });
