import { NextRequest } from "next/server";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { inferAssetTags } from "@/lib/tag-taxonomy";
import type { AssetTagType } from "@/lib/tag-taxonomy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AssetType = AssetTagType;
type Orientation = "9:16" | "16:9" | "1:1";
type AssetStatus = "ready" | "review" | "disabled";

type Asset = {
  id: string;
  name: string;
  type: AssetType;
  duration: string;
  orientation: Orientation;
  tags: string[];
  status: AssetStatus;
  color: string;
  source: string;
  matchScore: number;
  url?: string;
  thumbnailUrl?: string;
  fileName?: string;
  size?: number;
  uploadedAt?: string;
};

const dataDir = path.join(process.cwd(), "data");
const uploadsDir = path.join(process.cwd(), "public", "uploads");
const thumbnailsDir = path.join(uploadsDir, "thumbnails");
const assetsFile = path.join(dataDir, "assets.json");

function sanitizeFileName(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext)
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "asset"}${ext}`;
}

function inferType(mime: string): AssetType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "video";
}

function inferOrientation(type: AssetType): Orientation {
  if (type === "audio") return "1:1";
  return "9:16";
}

function assetColor(type: AssetType) {
  if (type === "image") return "#38bdf8";
  if (type === "audio") return "#64748b";
  if (type === "avatar") return "#a855f7";
  return "#f97316";
}

function getBundledFfmpegPath() {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "@remotion", "compositor-win32-x64-msvc", exe);
}

async function getFfmpegCommand() {
  const bundled = getBundledFfmpegPath();
  try {
    await fs.access(bundled);
    return bundled;
  } catch {
    return "ffmpeg";
  }
}

async function runFfmpeg(args: string[]) {
  const command = await getFfmpegCommand();

  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
    });

    let lastOutput = "";
    const appendOutput = (chunk: Buffer) => {
      lastOutput = `${lastOutput}${chunk.toString()}`.slice(-1200);
    };

    child.stdout?.on("data", appendOutput);
    child.stderr?.on("data", appendOutput);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exit ${code}: ${lastOutput}`));
    });
  });
}

async function createThumbnail(filePath: string, id: string, type: AssetType, url: string) {
  if (type === "image") return url;
  if (type !== "video") return undefined;

  await fs.mkdir(thumbnailsDir, { recursive: true });
  const thumbnailName = `${id}.jpg`;
  const thumbnailPath = path.join(thumbnailsDir, thumbnailName);

  try {
    await runFfmpeg([
      "-y",
      "-i",
      filePath,
      "-ss",
      "00:00:01",
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-1",
      thumbnailPath,
    ]);
    return `/uploads/thumbnails/${thumbnailName}`;
  } catch (error) {
    console.warn("Thumbnail generation failed:", error);
    return undefined;
  }
}

async function readAssets(): Promise<Asset[]> {
  try {
    const raw = await fs.readFile(assetsFile, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Asset[]) : [];
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeAssets(assets: Asset[]) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(assetsFile, JSON.stringify(assets, null, 2), "utf8");
}

export async function GET() {
  const assets = await readAssets();
  return Response.json({ assets }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "No files uploaded" }, { status: 400 });
  }

  await fs.mkdir(uploadsDir, { recursive: true });

  const existingAssets = await readAssets();
  const createdAssets: Asset[] = [];

  for (const file of files) {
    const id = crypto.randomUUID();
    const safeName = sanitizeFileName(file.name);
    const storedName = `${id}-${safeName}`;
    const filePath = path.join(uploadsDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const type = inferType(file.type);
    const url = `/uploads/${storedName}`;
    const thumbnailUrl = await createThumbnail(filePath, id, type, url);
    const asset: Asset = {
      id,
      name: path.basename(file.name, path.extname(file.name)) || safeName,
      type,
      duration: type === "audio" ? "待分析" : "待分析",
      orientation: inferOrientation(type),
      tags: inferAssetTags(file.name, file.type, type),
      status: "review",
      color: assetColor(type),
      source: "本地上传 / 自动打标",
      matchScore: 72,
      url,
      thumbnailUrl,
      fileName: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    createdAssets.push(asset);
  }

  await writeAssets([...existingAssets, ...createdAssets]);
  return Response.json({ assets: createdAssets });
}

export async function PATCH(request: NextRequest) {
  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null || !("id" in body)) {
    return Response.json({ error: "Asset id is required" }, { status: 400 });
  }

  const id = String((body as { id: unknown }).id);
  const assets = await readAssets();
  const index = assets.findIndex((asset) => asset.id === id);
  if (index === -1) {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }

  const nextAsset = { ...assets[index] };

  if ("tags" in body && Array.isArray((body as { tags: unknown }).tags)) {
    nextAsset.tags = (body as { tags: unknown[] }).tags
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  if ("status" in body) {
    const status = String((body as { status: unknown }).status);
    if (status === "ready" || status === "review" || status === "disabled") {
      nextAsset.status = status;
    }
  }

  assets[index] = nextAsset;
  await writeAssets(assets);
  return Response.json({ asset: nextAsset });
}
