import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoredVisionConfig = {
  endpoint: string;
  apiKey?: string;
};

type PublicVisionConfig = Omit<StoredVisionConfig, "apiKey"> & {
  apiKeySet: boolean;
  apiKeyPreview: string;
};

const dataDir = path.join(process.cwd(), "data");
const configFile = path.join(dataDir, "vision-config.json");

const defaultConfig: StoredVisionConfig = {
  endpoint: "",
};

function normalizeConfig(value: unknown): StoredVisionConfig {
  if (typeof value !== "object" || value === null) return defaultConfig;
  const raw = value as Record<string, unknown>;
  return {
    endpoint: typeof raw.endpoint === "string" ? raw.endpoint.trim() : "",
    apiKey: typeof raw.apiKey === "string" && raw.apiKey ? raw.apiKey : undefined,
  };
}

function toPublicConfig(config: StoredVisionConfig): PublicVisionConfig {
  const apiKey = config.apiKey ?? "";
  return {
    endpoint: config.endpoint,
    apiKeySet: apiKey.length > 0,
    apiKeyPreview: apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "",
  };
}

async function readConfig(): Promise<StoredVisionConfig> {
  try {
    const raw = await fs.readFile(configFile, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return defaultConfig;
    }
    throw error;
  }
}

async function writeConfig(config: StoredVisionConfig) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf8");
}

export async function GET() {
  const config = await readConfig();
  return Response.json(toPublicConfig(config), { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const current = await readConfig();
  const next: StoredVisionConfig = {
    ...current,
    endpoint: typeof raw.endpoint === "string" ? raw.endpoint.trim() : current.endpoint,
  };

  if (typeof raw.apiKey === "string" && raw.apiKey.length > 0) {
    next.apiKey = raw.apiKey;
  }
  if (raw.clearApiKey === true) {
    delete next.apiKey;
  }

  await writeConfig(next);
  return Response.json(toPublicConfig(next), { headers: { "Cache-Control": "no-store" } });
}
