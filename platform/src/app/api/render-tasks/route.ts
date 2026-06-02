import { NextRequest } from "next/server";
import crypto from "crypto";
import { createRenderTask, listRenderTasks, updateRenderTask } from "@/lib/render-task-store";
import { writeRenderTaskPayload } from "@/lib/render-task-payload-store";
import { drainRenderTaskBatch } from "@/lib/render-task-runner";
import type { RenderTask } from "@/lib/render-task-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RenderTaskSubmission = {
  ipId?: string;
  count?: number | string;
  batchIndex?: number;
  batchCount?: number;
  brand?: {
    id?: string;
    name?: string;
  };
  template?: {
    id?: string;
    name?: string;
  };
  script?: {
    platform?: string;
    videoPlan?: {
      id?: string;
    };
  };
};

function asSubmission(body: unknown): RenderTaskSubmission {
  return typeof body === "object" && body !== null ? body as RenderTaskSubmission : {};
}

function renderTaskId(ipId: string) {
  const safeIpId = ipId.replace(/[^a-z0-9_-]/gi, "") || "brand";
  return `task_${safeIpId}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function normalizedCount(value: RenderTaskSubmission["count"]) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  return Math.min(50, Math.max(1, Math.floor(count)));
}

export async function GET() {
  const tasks = await listRenderTasks(50);
  return Response.json({ tasks }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const payload = asSubmission(await request.json());
  const ipId = payload.ipId ?? payload.brand?.id ?? "wang";
  const count = normalizedCount(payload.count);
  const tasks: RenderTask[] = [];
  const jobs = [];

  for (let index = 1; index <= count; index += 1) {
    const createdTask = await createRenderTask({
      id: renderTaskId(ipId),
      brandId: ipId,
      brandName: payload.brand?.name ?? ipId,
      templateId: payload.template?.id ?? "default",
      templateName: payload.template?.name ?? "默认模板",
      platform: payload.script?.platform ?? "未知平台",
      videoPlanId: payload.script?.videoPlan?.id,
    });
    const taskPayload = { ...payload, count: 1, batchIndex: index, batchCount: count };
    await writeRenderTaskPayload(createdTask.id, taskPayload);
    const task = await updateRenderTask(createdTask.id, {
      stage: count > 1 ? `等待后台队列 (${index}/${count})` : "等待后台渲染",
      payloadStored: true,
    });
    tasks.push(task);
    jobs.push({ taskId: task.id, payload: taskPayload, index, total: count });
  }

  void drainRenderTaskBatch(request.nextUrl.origin, jobs);
  const currentTask = tasks[tasks.length - 1];
  if (!currentTask) {
    return Response.json({ error: "No render task created" }, { status: 500 });
  }

  return Response.json(
    { task: currentTask, tasks, taskId: currentTask.id, batchCount: count },
    {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
