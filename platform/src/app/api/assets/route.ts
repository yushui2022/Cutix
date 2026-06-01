import { NextRequest } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

type AssetType = "video" | "image" | "audio" | "avatar";
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
  fileName?: string;
  size?: number;
  uploadedAt?: string;
};

const dataDir = path.join(process.cwd(), "data");
const uploadsDir = path.join(process.cwd(), "public", "uploads");
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

function autoTags(fileName: string, mime: string, type: AssetType) {
  const text = `${fileName} ${mime}`.toLowerCase();
  const tags = new Set<string>();

  tags.add(type === "audio" ? "BGM" : type === "image" ? "图片" : "视频");

  const rules: Array<[RegExp, string]> = [
    [/门店|店铺|店面|store|shop/, "门店"],
    [/人流|客流|crowd|traffic/, "人流"],
    [/产品|商品|product|sku/, "产品"],
    [/案例|客户|case|client/, "案例"],
    [/口播|数字人|avatar|talking|host/, "口播"],
    [/招商|加盟|join|franchise/, "招商"],
    [/美妆|护肤|beauty|skin/, "美妆"],
    [/活动|节日|促销|sale|event/, "活动"],
  ];

  for (const [pattern, tag] of rules) {
    if (pattern.test(text)) tags.add(tag);
  }

  if (tags.size < 3 && type === "video") tags.add("待细分");
  if (tags.size < 3 && type === "image") tags.add("视觉素材");
  if (tags.size < 3 && type === "audio") tags.add("背景音乐");

  return Array.from(tags).slice(0, 6);
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
  return Response.json({ assets });
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
    const asset: Asset = {
      id,
      name: path.basename(file.name, path.extname(file.name)) || safeName,
      type,
      duration: type === "audio" ? "待分析" : "待分析",
      orientation: inferOrientation(type),
      tags: autoTags(file.name, file.type, type),
      status: "review",
      color: assetColor(type),
      source: "本地上传 / 自动打标",
      matchScore: 72,
      url: `/uploads/${storedName}`,
      fileName: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    createdAssets.push(asset);
  }

  await writeAssets([...existingAssets, ...createdAssets]);
  return Response.json({ assets: createdAssets });
}
