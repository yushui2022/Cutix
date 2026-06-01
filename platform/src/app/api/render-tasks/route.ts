import { listRenderTasks } from "@/lib/render-task-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const tasks = await listRenderTasks(50);
  return Response.json({ tasks }, { headers: { "Cache-Control": "no-store" } });
}
