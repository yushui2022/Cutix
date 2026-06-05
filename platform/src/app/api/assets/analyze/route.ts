import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AssetType = "video" | "image" | "audio" | "avatar";
type Orientation = "9:16" | "16:9" | "1:1";
type AssetStatus = "ready" | "review" | "disabled";

type AssetAnalysis = {
  status: "metadata-only" | "keyframed" | "pending";
  keyframes: string[];
  width?: number;
  height?: number;
  durationMs?: number;
  visionStatus: string;
  visionProvider?: string;
  summary?: string;
  analyzedAt?: string;
};

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
  localPath?: string;
  fileName?: string;
  size?: number;
  uploadedAt?: string;
  analysis?: AssetAnalysis;
};

type AnalyzeRequest = {
  assetId?: string;
  all?: boolean;
};

type VisionResponse = {
  tags?: unknown;
  summary?: unknown;
  provider?: unknown;
};

type VisionConfig = {
  endpoint: string;
  apiKey?: string;
};

const dataDir = path.join(process.cwd(), "data");
const assetsFile = path.join(dataDir, "assets.json");
const visionConfigFile = path.join(dataDir, "vision-config.json");
const publicDir = path.join(process.cwd(), "public");

function normalizeVisionConfig(value: unknown): VisionConfig {
  if (typeof value !== "object" || value === null) return { endpoint: "" };
  const raw = value as Record<string, unknown>;
  return {
    endpoint: typeof raw.endpoint === "string" ? raw.endpoint.trim() : "",
    apiKey: typeof raw.apiKey === "string" && raw.apiKey ? raw.apiKey : undefined,
  };
}

async function readVisionConfig(): Promise<VisionConfig> {
  const envEndpoint = process.env.CUTIX_VISION_ANALYZER_URL || process.env.VISION_MODEL_ENDPOINT || "";
  if (envEndpoint) {
    return {
      endpoint: envEndpoint,
      apiKey: process.env.CUTIX_VISION_ANALYZER_KEY || process.env.VISION_MODEL_API_KEY || undefined,
    };
  }

  try {
    const raw = await fs.readFile(visionConfigFile, "utf8");
    return normalizeVisionConfig(JSON.parse(raw));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return { endpoint: "" };
    }
    throw error;
  }
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((tag) => String(tag).trim())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

function framePathFromUrl(frameUrl: string) {
  const relative = frameUrl.replace(/^\/+/, "");
  return path.join(publicDir, relative);
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

async function callVisionService(asset: Asset, config: VisionConfig): Promise<VisionResponse> {
  const keyframes = asset.analysis?.keyframes ?? [];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      asset: {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        tags: asset.tags,
        orientation: asset.orientation,
        duration: asset.duration,
      },
      frames: keyframes.map((url) => ({
        url,
        path: framePathFromUrl(url),
      })),
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as VisionResponse;
}

async function analyzeAsset(asset: Asset, config: VisionConfig) {
  const keyframes = asset.analysis?.keyframes ?? [];
  const baseAnalysis: AssetAnalysis = {
    status: keyframes.length > 0 ? "keyframed" : asset.analysis?.status ?? "pending",
    keyframes,
    width: asset.analysis?.width,
    height: asset.analysis?.height,
    durationMs: asset.analysis?.durationMs,
    visionStatus: asset.analysis?.visionStatus ?? "待接入本地视觉模型",
    visionProvider: asset.analysis?.visionProvider,
    summary: asset.analysis?.summary,
    analyzedAt: asset.analysis?.analyzedAt,
  };

  if (keyframes.length === 0) {
    return {
      ...asset,
      analysis: {
        ...baseAnalysis,
        visionStatus: "当前素材没有关键帧，无法进行视觉模型打标",
        analyzedAt: new Date().toISOString(),
      },
    };
  }

  if (!config.endpoint) {
    return {
      ...asset,
      analysis: {
        ...baseAnalysis,
        visionStatus: "未配置本地视觉模型服务，已保留关键帧等待打标",
        analyzedAt: new Date().toISOString(),
      },
    };
  }

  const result = await callVisionService(asset, config);
  const visionTags = normalizeTags(result.tags);
  const mergedTags = Array.from(new Set([...asset.tags, ...visionTags])).slice(0, 16);
  const provider = typeof result.provider === "string" && result.provider.trim()
    ? result.provider.trim()
    : config.endpoint;
  const summary = typeof result.summary === "string" && result.summary.trim()
    ? result.summary.trim()
    : undefined;

  return {
    ...asset,
    tags: mergedTags,
    source: "本地上传 / 视觉模型打标",
    matchScore: Math.max(asset.matchScore, visionTags.length > 0 ? 86 : asset.matchScore),
    analysis: {
      ...baseAnalysis,
      visionStatus: visionTags.length > 0
        ? `本地视觉模型已补充 ${visionTags.length} 个标签`
        : "本地视觉模型已分析，未返回新标签",
      visionProvider: provider,
      summary,
      analyzedAt: new Date().toISOString(),
    },
  };
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const data = typeof body === "object" && body !== null ? body as AnalyzeRequest : {};
  const assets = await readAssets();
  const visionConfig = await readVisionConfig();
  const targetIds = data.all
    ? assets.filter((asset) => (asset.analysis?.keyframes ?? []).length > 0).map((asset) => asset.id)
    : data.assetId
      ? [data.assetId]
      : [];

  if (targetIds.length === 0) {
    return Response.json({ error: "Asset id or all=true is required" }, { status: 400 });
  }

  const targetIdSet = new Set(targetIds);
  let updated = 0;
  const nextAssets: Asset[] = [];

  for (const asset of assets) {
    if (!targetIdSet.has(asset.id)) {
      nextAssets.push(asset);
      continue;
    }

    const nextAsset = await analyzeAsset(asset, visionConfig);
    nextAssets.push(nextAsset);
    updated += 1;
  }

  await writeAssets(nextAssets);

  const firstAsset = data.assetId ? nextAssets.find((asset) => asset.id === data.assetId) : undefined;
  return Response.json(
    {
      configured: Boolean(visionConfig.endpoint),
      updated,
      asset: firstAsset,
      assets: data.all ? nextAssets.filter((asset) => targetIdSet.has(asset.id)) : undefined,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
