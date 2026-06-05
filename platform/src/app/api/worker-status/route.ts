import { listRenderTasks } from "@/lib/render-task-store";
import { listWorkerStates } from "@/lib/worker-state-store";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StorageDirectory = {
  key: string;
  label: string;
  path: string;
};

const storageDirectories: StorageDirectory[] = [
  { key: "output", label: "输出", path: path.join(process.cwd(), "public", "output") },
  { key: "uploads", label: "上传", path: path.join(process.cwd(), "public", "uploads") },
  { key: "data", label: "任务数据", path: path.join(process.cwd(), "data") },
];

let storageCache: {
  createdAt: number;
  value: Awaited<ReturnType<typeof scanStorageUsage>>;
} | null = null;

async function directorySizeBytes(targetPath: string): Promise<number> {
  let entries;
  try {
    entries = await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(entryPath);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stat = await fs.stat(entryPath);
      total += stat.size;
    } catch {
      // Ignore files that disappear while scanning.
    }
  }
  return total;
}

async function scanStorageUsage() {
  const directories = await Promise.all(
    storageDirectories.map(async (directory) => ({
      ...directory,
      bytes: await directorySizeBytes(directory.path),
    })),
  );

  return {
    totalBytes: directories.reduce((sum, directory) => sum + directory.bytes, 0),
    directories,
  };
}

async function storageUsage() {
  const now = Date.now();
  if (storageCache && now - storageCache.createdAt < 15_000) return storageCache.value;

  const value = await scanStorageUsage();
  storageCache = { createdAt: now, value };
  return value;
}

export async function GET() {
  const [tasks, workers, storage] = await Promise.all([listRenderTasks(200), listWorkerStates(), storageUsage()]);
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
        canceled: tasks.filter((task) => task.status === "canceled").length,
      },
      storage,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
