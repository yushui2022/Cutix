import { listRenderTasks } from "@/lib/render-task-store";
import { listWorkerStates } from "@/lib/worker-state-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [tasks, workers] = await Promise.all([listRenderTasks(200), listWorkerStates()]);
  const now = Date.now();
  const healthyWorkers = workers.filter((worker) => now - Date.parse(worker.lastHeartbeatAt) < 30_000);

  return Response.json(
    {
      workers,
      healthyWorkers,
      queue: {
        total: tasks.length,
        queued: tasks.filter((task) => task.status === "queued").length,
        running: tasks.filter((task) => task.status === "running").length,
        completed: tasks.filter((task) => task.status === "completed").length,
        failed: tasks.filter((task) => task.status === "failed").length,
      },
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
