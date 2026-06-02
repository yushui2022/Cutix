import fs from "fs/promises";
import path from "path";

export type RenderTaskStatus = "queued" | "running" | "completed" | "failed";

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
  completedAt?: string;
};

export type RenderTaskPatch = Partial<Omit<RenderTask, "id" | "createdAt">>;

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
  });
}

export async function updateRenderTask(taskId: string, patch: RenderTaskPatch) {
  const current = await readRenderTask(taskId);
  if (!current) throw new Error(`Render task not found: ${taskId}`);

  return writeRenderTask({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
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
