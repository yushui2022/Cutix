import { NextRequest } from "next/server";
import { readRenderTask, updateRenderTask } from "@/lib/render-task-store";
import { readRenderTaskPayload } from "@/lib/render-task-payload-store";
import { drainRenderTaskStream } from "@/lib/render-task-runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  const task = await readRenderTask(taskId);
  if (!task) return Response.json({ error: "Render task not found" }, { status: 404 });

  const payload = await readRenderTaskPayload(taskId);
  if (!payload) {
    return Response.json(
      { error: "Render payload not found. This task was created before retry payload persistence." },
      { status: 404 },
    );
  }

  const queuedTask = await updateRenderTask(taskId, {
    status: "queued",
    stage: "等待重试渲染",
    error: undefined,
    resultUrl: undefined,
    previewUrl: undefined,
    coverUrl: undefined,
    hasAudio: undefined,
    scenes: undefined,
    completedAt: undefined,
    payloadStored: true,
    resetTiming: true,
  });

  void drainRenderTaskStream(request.nextUrl.origin, taskId, payload);

  return Response.json(
    { task: queuedTask, taskId },
    {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
