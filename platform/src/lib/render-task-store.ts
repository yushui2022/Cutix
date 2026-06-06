import fs from "fs/promises";
import path from "path";

export type RenderTaskStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export type RenderTaskStageDuration = {
  stage: string;
  status: RenderTaskStatus;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
};

export type RenderTaskStageHistoryItem = {
  stage: string;
  status: RenderTaskStatus;
  at: string;
};

export type RenderTask = {
  id: string;
  status: RenderTaskStatus;
  stage: string;
  brandId: string;
  brandName: string;
  templateId: string;
  templateName: string;
  platform: string;
  videoPlanId?: string;
  resultUrl?: string;
  previewUrl?: string;
  coverUrl?: string;
  hasAudio?: boolean;
  payloadStored?: boolean;
  scenes?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  stageStartedAt?: string;
  stageDurations?: RenderTaskStageDuration[];
  stageHistory?: RenderTaskStageHistoryItem[];
  completedAt?: string;
};

export type RenderTaskPatch = Partial<Omit<RenderTask, "id" | "createdAt">> & {
  resetTiming?: boolean;
};

const taskDir = path.join(process.cwd(), "data", "render-tasks");

function taskFile(taskId: string) {
  return path.join(taskDir, `${taskId}.json`);
}

export async function writeRenderTask(task: RenderTask) {
  await fs.mkdir(taskDir, { recursive: true });
  await fs.writeFile(taskFile(task.id), JSON.stringify(task, null, 2), "utf8");
  return task;
}

export async function createRenderTask(input: {
  id: string;
  brandId: string;
  brandName: string;
  templateId: string;
  templateName: string;
  platform: string;
  videoPlanId?: string;
}) {
  const now = new Date().toISOString();
  return writeRenderTask({
    id: input.id,
    status: "queued",
    stage: "等待渲染",
    brandId: input.brandId,
    brandName: input.brandName,
    templateId: input.templateId,
    templateName: input.templateName,
    platform: input.platform,
    videoPlanId: input.videoPlanId,
    createdAt: now,
    updatedAt: now,
    stageStartedAt: now,
    stageHistory: [{ stage: "等待渲染", status: "queued", at: now }],
  });
}

export async function updateRenderTask(taskId: string, patch: RenderTaskPatch) {
  const current = await readRenderTask(taskId);
  if (!current) throw new Error(`Render task not found: ${taskId}`);

  const { resetTiming, ...taskPatch } = patch;
  const now = new Date().toISOString();
  const nextStatus = taskPatch.status ?? current.status;
  const nextStage = taskPatch.stage ?? current.stage;
  const stageChanged = typeof taskPatch.stage === "string" && taskPatch.stage !== current.stage;
  const statusChanged = typeof taskPatch.status === "string" && taskPatch.status !== current.status;
  const currentIsTerminal = current.status === "completed" || current.status === "failed" || current.status === "canceled";
  const nextIsTerminal = nextStatus === "completed" || nextStatus === "failed" || nextStatus === "canceled";
  const shouldCloseCurrentStage = !resetTiming && (stageChanged || statusChanged || (!currentIsTerminal && nextIsTerminal));
  const nextStageDurations = resetTiming ? [] : [...(current.stageDurations ?? [])];
  const nextStageHistory = resetTiming
    ? [{ stage: nextStage, status: nextStatus, at: now }]
    : current.stageHistory
      ? [...current.stageHistory]
      : [{ stage: current.stage, status: current.status, at: current.stageStartedAt ?? current.createdAt }];
  let nextStageStartedAt = resetTiming ? now : current.stageStartedAt ?? current.createdAt;
  const nextStartedAt = resetTiming
    ? nextStatus === "running"
      ? now
      : undefined
    : current.startedAt ?? (nextStatus === "running" ? now : undefined);

  if (shouldCloseCurrentStage) {
    const previousStageStartedAt = current.stageStartedAt ?? current.updatedAt ?? current.createdAt;
    const previousStartedMs = Date.parse(previousStageStartedAt);
    const completedMs = Date.parse(now);
    if (Number.isFinite(previousStartedMs) && Number.isFinite(completedMs) && completedMs >= previousStartedMs) {
      nextStageDurations.push({
        stage: current.stage,
        status: current.status,
        startedAt: previousStageStartedAt,
        completedAt: now,
        elapsedMs: completedMs - previousStartedMs,
      });
    }
    nextStageStartedAt = now;
  }

  if ((stageChanged || statusChanged) && !resetTiming) {
    nextStageHistory.push({ stage: nextStage, status: nextStatus, at: now });
  }

  return writeRenderTask({
    ...current,
    ...taskPatch,
    status: nextStatus,
    stage: nextStage,
    updatedAt: now,
    startedAt: nextStartedAt,
    stageStartedAt: nextStageStartedAt,
    stageDurations: nextStageDurations,
    stageHistory: nextStageHistory,
  });
}

export async function readRenderTask(taskId: string): Promise<RenderTask | null> {
  try {
    return JSON.parse(await fs.readFile(taskFile(taskId), "utf8")) as RenderTask;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function listRenderTasks(limit = 20) {
  try {
    const entries = await fs.readdir(taskDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(taskDir, entry.name));

    const tasks = await Promise.all(
      files.map(async (file) => JSON.parse(await fs.readFile(file, "utf8")) as RenderTask),
    );

    return tasks
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
