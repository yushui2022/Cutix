import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LlmProvider = "openai-compatible" | "ollama" | "vllm" | "custom";

type StoredLlmConfig = {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  temperature: number;
  apiKey?: string;
};

type PublicLlmConfig = Omit<StoredLlmConfig, "apiKey"> & {
  apiKeySet: boolean;
  apiKeyPreview: string;
};

const dataDir = path.join(process.cwd(), "data");
const configFile = path.join(dataDir, "llm-config.json");

const defaultConfig: StoredLlmConfig = {
  provider: "openai-compatible",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "qwen2.5:7b",
  temperature: 0.7,
};

function toPublicConfig(config: StoredLlmConfig): PublicLlmConfig {
  const apiKey = config.apiKey ?? "";
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    apiKeySet: apiKey.length > 0,
    apiKeyPreview: apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "",
  };
}

function normalizeConfig(value: unknown): StoredLlmConfig {
  if (typeof value !== "object" || value === null) return defaultConfig;
  const raw = value as Record<string, unknown>;
  const provider = raw.provider === "ollama" || raw.provider === "vllm" || raw.provider === "custom"
    ? raw.provider
    : "openai-compatible";
  const temperature = typeof raw.temperature === "number"
    ? Math.min(2, Math.max(0, raw.temperature))
    : defaultConfig.temperature;

  return {
    provider,
    baseUrl: typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : defaultConfig.baseUrl,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : defaultConfig.model,
    temperature,
    apiKey: typeof raw.apiKey === "string" && raw.apiKey ? raw.apiKey : undefined,
  };
}

async function readConfig(): Promise<StoredLlmConfig> {
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

async function writeConfig(config: StoredLlmConfig) {
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
  const next: StoredLlmConfig = {
    ...current,
    provider: raw.provider === "ollama" || raw.provider === "vllm" || raw.provider === "custom"
      ? raw.provider
      : raw.provider === "openai-compatible"
        ? "openai-compatible"
        : current.provider,
    baseUrl: typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : current.baseUrl,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : current.model,
    temperature: typeof raw.temperature === "number"
      ? Math.min(2, Math.max(0, raw.temperature))
      : current.temperature,
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
