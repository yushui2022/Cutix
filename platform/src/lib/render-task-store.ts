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
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  stageStartedAt?: string;
  stageDurations?: RenderTaskStageDuration[];
  stageHistory?: RenderTaskStageHistoryItem[];
  attempt?: number;
  maxAttempts?: number;
  lockedBy?: string;
  lockedAt?: string;
  nextRunAt?: string;
  completedAt?: string;
};

export type RenderTaskPatch = Partial<Omit<RenderTask, "id" | "createdAt">> & {
  resetTiming?: boolean;
};

const taskDir = path.join(process.cwd(), "data", "render-tasks");
const lockDir = path.join(process.cwd(), "data", "render-task-locks");

const terminalStatuses: RenderTaskStatus[] = ["completed", "failed", "canceled"];

function taskFile(taskId: string) {
  return path.join(taskDir, `${taskId}.json`);
}

function lockFile(taskId: string) {
  return path.join(lockDir, `${taskId}.lock`);
}

function isNodeError(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function numberFromEnv(name: string, fallback: number, min: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

export function defaultRenderTaskMaxAttempts() {
  return numberFromEnv("CUTIX_RENDER_TASK_MAX_ATTEMPTS", 3, 1);
}

export function defaultRenderTaskLeaseMs() {
  return numberFromEnv("CUTIX_RENDER_TASK_LEASE_MS", 60 * 60 * 1000, 60_000);
}

function defaultRetryBaseMs() {
  return numberFromEnv("CUTIX_RENDER_TASK_RETRY_BASE_MS", 2_000, 0);
}

function defaultRetryMaxMs() {
  return numberFromEnv("CUTIX_RENDER_TASK_RETRY_MAX_MS", 60_000, 0);
}

function taskAttempt(task: RenderTask) {
  return Math.max(0, Math.floor(task.attempt ?? 0));
}

function taskMaxAttempts(task: RenderTask) {
  return Math.max(1, Math.floor(task.maxAttempts ?? defaultRenderTaskMaxAttempts()));
}

function retryDelayMs(attempt: number) {
  const baseMs = defaultRetryBaseMs();
  const maxMs = defaultRetryMaxMs();
  if (baseMs <= 0 || maxMs <= 0) return 0;
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

async function tryAcquireRenderTaskLock(taskId: string, workerId: string, staleMs: number) {
  await fs.mkdir(lockDir, { recursive: true });
  const target = lockFile(taskId);
  try {
    const handle = await fs.open(target, "wx");
    try {
      await handle.writeFile(JSON.stringify({ taskId, workerId, lockedAt: new Date().toISOString() }, null, 2), "utf8");
    } finally {
      await handle.close();
    }
    return true;
  } catch (error: unknown) {
    if (!isNodeError(error, "EEXIST")) throw error;
    try {
      const stat = await fs.stat(target);
      if (Date.now() - stat.mtimeMs <= staleMs) return false;
      await fs.rm(target, { force: true });
    } catch (statError: unknown) {
      if (!isNodeError(statError, "ENOENT")) throw statError;
    }
    return tryAcquireRenderTaskLock(taskId, workerId, staleMs);
  }
}

export async function releaseRenderTaskLock(taskId: string) {
  await fs.rm(lockFile(taskId), { force: true });
}

export async function writeRenderTask(task: RenderTask) {
  await fs.mkdir(taskDir, { recursive: true });
  const target = taskFile(task.id);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(task, null, 2), "utf8");
  await fs.rename(temporary, target);
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
  maxAttempts?: number;
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
    attempt: 0,
    maxAttempts: input.maxAttempts ?? defaultRenderTaskMaxAttempts(),
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
  const currentIsTerminal = terminalStatuses.includes(current.status);
  const nextIsTerminal = terminalStatuses.includes(nextStatus);
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

export async function claimNextQueuedRenderTask(workerId: string, options?: {
  limit?: number;
  leaseMs?: number;
  stage?: string;
  taskIds?: string[];
}) {
  const nowMs = Date.now();
  const limit = options?.limit ?? 200;
  const leaseMs = options?.leaseMs ?? defaultRenderTaskLeaseMs();
  const tasks = await listRenderTasks(limit);
  const allowedTaskIds = options?.taskIds ? new Set(options.taskIds) : null;
  const candidates = tasks
    .filter((task) => {
      if (allowedTaskIds && !allowedTaskIds.has(task.id)) return false;
      if (task.status !== "queued" || !task.payloadStored) return false;
      const nextRunMs = task.nextRunAt ? Date.parse(task.nextRunAt) : null;
      return nextRunMs === null || !Number.isFinite(nextRunMs) || nextRunMs <= nowMs;
    })
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  for (const task of candidates) {
    const locked = await tryAcquireRenderTaskLock(task.id, workerId, leaseMs);
    if (!locked) continue;

    const latest = await readRenderTask(task.id);
    if (!latest || latest.status !== "queued" || !latest.payloadStored) {
      await releaseRenderTaskLock(task.id);
      continue;
    }

    return updateRenderTask(task.id, {
      status: "running",
      stage: options?.stage ?? "独立 Worker 已接管",
      attempt: taskAttempt(latest) + 1,
      maxAttempts: taskMaxAttempts(latest),
      lockedBy: workerId,
      lockedAt: new Date(nowMs).toISOString(),
      nextRunAt: undefined,
      completedAt: undefined,
    });
  }

  return null;
}

export async function clearRenderTaskLease(taskId: string, workerId?: string) {
  const task = await readRenderTask(taskId);
  if (!task) return null;
  if (workerId && task.lockedBy && task.lockedBy !== workerId) return task;

  await releaseRenderTaskLock(taskId);
  return updateRenderTask(taskId, {
    lockedBy: undefined,
    lockedAt: undefined,
    nextRunAt: undefined,
  });
}

export async function scheduleRenderTaskRetry(taskId: string, error?: string) {
  const task = await readRenderTask(taskId);
  if (!task) return { retried: false, task: null, delayMs: 0 };

  const attempt = taskAttempt(task);
  const maxAttempts = taskMaxAttempts(task);
  if (attempt >= maxAttempts) {
    await clearRenderTaskLease(taskId, task.lockedBy);
    return { retried: false, task, delayMs: 0 };
  }

  const delayMs = retryDelayMs(attempt);
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  const retriedTask = await updateRenderTask(taskId, {
    status: "queued",
    stage: `等待自动重试 (${attempt + 1}/${maxAttempts})`,
    error: undefined,
    lastError: error ?? task.error,
    resultUrl: undefined,
    previewUrl: undefined,
    coverUrl: undefined,
    hasAudio: undefined,
    scenes: undefined,
    completedAt: undefined,
    lockedBy: undefined,
    lockedAt: undefined,
    nextRunAt,
    resetTiming: true,
  });
  await releaseRenderTaskLock(taskId);
  return { retried: true, task: retriedTask, delayMs };
}

export async function recoverTimedOutRenderTasks(options?: {
  limit?: number;
  leaseMs?: number;
  taskIds?: string[];
}) {
  const nowMs = Date.now();
  const leaseMs = options?.leaseMs ?? defaultRenderTaskLeaseMs();
  const tasks = await listRenderTasks(options?.limit ?? 200);
  const allowedTaskIds = options?.taskIds ? new Set(options.taskIds) : null;
  let requeued = 0;
  let failed = 0;

  for (const task of tasks) {
    if (allowedTaskIds && !allowedTaskIds.has(task.id)) continue;
    if (task.status !== "running") continue;

    const activityMs = Math.max(
      Date.parse(task.updatedAt) || 0,
      Date.parse(task.lockedAt ?? "") || 0,
    );
    if (activityMs > 0 && nowMs - activityMs <= leaseMs) continue;

    const attempt = taskAttempt(task);
    const maxAttempts = taskMaxAttempts(task);
    const message = `Render task lease timed out after ${Math.round(leaseMs / 1000)}s`;
    await releaseRenderTaskLock(task.id);

    if (attempt < maxAttempts) {
      await updateRenderTask(task.id, {
        status: "queued",
        stage: `Worker 超时，等待自动重试 (${attempt + 1}/${maxAttempts})`,
        error: undefined,
        lastError: task.error ?? message,
        completedAt: undefined,
        lockedBy: undefined,
        lockedAt: undefined,
        nextRunAt: new Date(nowMs).toISOString(),
        resetTiming: true,
      });
      requeued += 1;
      continue;
    }

    await updateRenderTask(task.id, {
      status: "failed",
      stage: "Worker 超时失败",
      error: task.error ?? message,
      completedAt: new Date(nowMs).toISOString(),
      lockedBy: undefined,
      lockedAt: undefined,
      nextRunAt: undefined,
    });
    failed += 1;
  }

  return { requeued, failed, generatedAt: new Date(nowMs).toISOString() };
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

    const tasks = (
      await Promise.all(
        files.map(async (file) => {
          try {
            return JSON.parse(await fs.readFile(file, "utf8")) as RenderTask;
          } catch {
            return null;
          }
        }),
      )
    ).filter((task): task is RenderTask => task !== null);

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
