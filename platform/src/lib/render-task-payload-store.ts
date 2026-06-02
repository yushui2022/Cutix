import fs from "fs/promises";
import path from "path";

export type RenderTaskPayload = Record<string, unknown> & {
  taskId?: string;
  count?: number | string;
  batchIndex?: number;
  batchCount?: number;
};

const payloadDir = path.join(process.cwd(), "data", "render-task-payloads");

function payloadFile(taskId: string) {
  return path.join(payloadDir, `${taskId}.json`);
}

export async function writeRenderTaskPayload(taskId: string, payload: RenderTaskPayload) {
  await fs.mkdir(payloadDir, { recursive: true });
  await fs.writeFile(payloadFile(taskId), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function readRenderTaskPayload(taskId: string): Promise<RenderTaskPayload | null> {
  try {
    return JSON.parse(await fs.readFile(payloadFile(taskId), "utf8")) as RenderTaskPayload;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
