import { NextRequest } from "next/server";
import crypto from "crypto";
import { createRenderTask, listRenderTasks, updateRenderTask } from "@/lib/render-task-store";
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

const activeRenderTaskIds = new Set<string>();

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

async function drainRenderStream(origin: string, taskId: string, payload: RenderTaskSubmission) {
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

async function drainRenderBatch(
  origin: string,
  jobs: Array<{ taskId: string; payload: RenderTaskSubmission; index: number; total: number }>,
) {
  for (const job of jobs) {
    await updateRenderTask(job.taskId, {
      stage: job.total > 1 ? `后台队列执行中 (${job.index}/${job.total})` : "后台渲染中",
    });
    await drainRenderStream(origin, job.taskId, job.payload);
  }
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
    const task = await updateRenderTask(createdTask.id, {
      stage: count > 1 ? `等待后台队列 (${index}/${count})` : "等待后台渲染",
    });
    const taskPayload = { ...payload, count: 1, batchIndex: index, batchCount: count };
    tasks.push(task);
    jobs.push({ taskId: task.id, payload: taskPayload, index, total: count });
  }

  void drainRenderBatch(request.nextUrl.origin, jobs);
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
