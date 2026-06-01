import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DigitalHumanProvider = "placeholder" | "musetalk-cli" | "http-api";

type StoredDigitalHumanConfig = {
  provider: DigitalHumanProvider;
  endpoint: string;
  avatarPath: string;
  pythonPath: string;
  apiKey?: string;
};

type PublicDigitalHumanConfig = Omit<StoredDigitalHumanConfig, "apiKey"> & {
  apiKeySet: boolean;
  apiKeyPreview: string;
};

const dataDir = path.join(process.cwd(), "data");
const configFile = path.join(dataDir, "digital-human-config.json");

const defaultConfig: StoredDigitalHumanConfig = {
  provider: "placeholder",
  endpoint: "",
  avatarPath: "",
  pythonPath: "python",
};

function normalizeProvider(value: unknown): DigitalHumanProvider {
  if (value === "musetalk-cli" || value === "http-api") return value;
  return "placeholder";
}

function normalizeConfig(value: unknown): StoredDigitalHumanConfig {
  if (typeof value !== "object" || value === null) return defaultConfig;
  const raw = value as Record<string, unknown>;
  return {
    provider: normalizeProvider(raw.provider),
    endpoint: typeof raw.endpoint === "string" ? raw.endpoint.trim() : "",
    avatarPath: typeof raw.avatarPath === "string" ? raw.avatarPath.trim() : "",
    pythonPath: typeof raw.pythonPath === "string" && raw.pythonPath.trim() ? raw.pythonPath.trim() : "python",
    apiKey: typeof raw.apiKey === "string" && raw.apiKey ? raw.apiKey : undefined,
  };
}

function toPublicConfig(config: StoredDigitalHumanConfig): PublicDigitalHumanConfig {
  const apiKey = config.apiKey ?? "";
  return {
    provider: config.provider,
    endpoint: config.endpoint,
    avatarPath: config.avatarPath,
    pythonPath: config.pythonPath,
    apiKeySet: apiKey.length > 0,
    apiKeyPreview: apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "",
  };
}

async function readConfig(): Promise<StoredDigitalHumanConfig> {
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

async function writeConfig(config: StoredDigitalHumanConfig) {
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
  const next: StoredDigitalHumanConfig = {
    ...current,
    provider: normalizeProvider(raw.provider ?? current.provider),
    endpoint: typeof raw.endpoint === "string" ? raw.endpoint.trim() : current.endpoint,
    avatarPath: typeof raw.avatarPath === "string" ? raw.avatarPath.trim() : current.avatarPath,
    pythonPath: typeof raw.pythonPath === "string" && raw.pythonPath.trim()
      ? raw.pythonPath.trim()
      : current.pythonPath,
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
