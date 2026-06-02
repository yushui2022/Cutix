import fs from "fs/promises";
import path from "path";

export type WorkerState = {
  id: string;
  kind: "render";
  status: "idle" | "processing" | "stopped";
  origin: string;
  currentTaskId?: string;
  processedTasks: number;
  startedAt: string;
  lastHeartbeatAt: string;
};

const workerDir = path.join(process.cwd(), "data", "worker-state");

function workerFile(workerId: string) {
  return path.join(workerDir, `${workerId}.json`);
}

export async function writeWorkerState(state: WorkerState) {
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(workerFile(state.id), JSON.stringify(state, null, 2), "utf8");
  return state;
}

export async function listWorkerStates() {
  try {
    const entries = await fs.readdir(workerDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(workerDir, entry.name));

    const states = await Promise.all(
      files.map(async (file) => JSON.parse(await fs.readFile(file, "utf8")) as WorkerState),
    );

    return states.sort((left, right) => right.lastHeartbeatAt.localeCompare(left.lastHeartbeatAt));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
