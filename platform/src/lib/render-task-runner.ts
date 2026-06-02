import { updateRenderTask } from "@/lib/render-task-store";
import type { RenderTaskPayload } from "@/lib/render-task-payload-store";

const activeRenderTaskIds = new Set<string>();

export async function drainRenderTaskStream(origin: string, taskId: string, payload: RenderTaskPayload) {
  if (activeRenderTaskIds.has(taskId)) return;
  activeRenderTaskIds.add(taskId);

  try {
    const response = await fetch(`${origin}/api/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, taskId }),
    });

    if (!response.ok) throw new Error(await response.text());

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Render stream is not available");

    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown render error";
    console.error("Background render task failed:", error);
    await updateRenderTask(taskId, {
      status: "failed",
      stage: "后台渲染失败",
      error: message,
      completedAt: new Date().toISOString(),
    });
  } finally {
    activeRenderTaskIds.delete(taskId);
  }
}

export async function drainRenderTaskBatch(
  origin: string,
  jobs: Array<{ taskId: string; payload: RenderTaskPayload; index: number; total: number }>,
) {
  for (const job of jobs) {
    await updateRenderTask(job.taskId, {
      stage: job.total > 1 ? `后台队列执行中 (${job.index}/${job.total})` : "后台渲染中",
    });
    await drainRenderTaskStream(origin, job.taskId, job.payload);
  }
}
