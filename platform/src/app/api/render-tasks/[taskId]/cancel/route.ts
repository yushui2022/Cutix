import { readRenderTask, updateRenderTask } from "@/lib/render-task-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  const task = await readRenderTask(taskId);

  if (!task) {
    return Response.json({ error: "Render task not found" }, { status: 404 });
  }

  if (task.status !== "queued") {
    return Response.json(
      { error: "Only queued render tasks can be canceled", task },
      { status: 409 },
    );
  }

  const canceledTask = await updateRenderTask(taskId, {
    status: "canceled",
    stage: "已取消",
    completedAt: new Date().toISOString(),
  });

  return Response.json(
    { task: canceledTask, taskId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
