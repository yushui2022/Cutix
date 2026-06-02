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

type BrandDigitalHumanProfile = {
  roleName?: string;
  avatarPath?: string;
  voiceId?: string;
  notes?: string;
};

type TestRequest = {
  brand?: {
    id?: string;
    name?: string;
    digitalHuman?: BrandDigitalHumanProfile;
  };
  network?: boolean;
};

type ReadinessCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
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

async function readConfig(): Promise<StoredDigitalHumanConfig> {
  try {
    return normalizeConfig(JSON.parse(await fs.readFile(configFile, "utf8")));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return defaultConfig;
    }
    throw error;
  }
}

async function pathExists(value: string) {
  try {
    await fs.access(value);
    return true;
  } catch {
    return false;
  }
}

function check(key: string, label: string, status: ReadinessCheck["status"], message: string): ReadinessCheck {
  return { key, label, status, message };
}

async function testHttpEndpoint(config: StoredDigitalHumanConfig): Promise<ReadinessCheck> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  try {
    const response = await fetch(config.endpoint, {
      method: "OPTIONS",
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (response.status >= 500) {
      return check("http-network", "服务响应", "fail", `服务返回 HTTP ${response.status}`);
    }

    return check("http-network", "服务响应", "pass", `服务有响应，HTTP ${response.status}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return check("http-network", "服务响应", "fail", `无法连接数字人服务：${message}`);
  }
}

async function buildChecks(config: StoredDigitalHumanConfig, request: TestRequest): Promise<ReadinessCheck[]> {
  const profile = request.brand?.digitalHuman;
  const avatarPath = profile?.avatarPath?.trim() || config.avatarPath;
  const checks: ReadinessCheck[] = [
    check(
      "role",
      "角色档案",
      profile?.roleName ? "pass" : "warn",
      profile?.roleName ? `当前角色：${profile.roleName}` : "未填写角色名称，将使用品牌名称兜底",
    ),
  ];

  if (config.provider === "placeholder") {
    checks.push(check("provider", "生产接入", "fail", "当前未接生产数字人服务"));
    return checks;
  }

  checks.push(check("provider", "生产接入", "pass", config.provider === "http-api" ? "HTTP API" : "MuseTalk 本地"));

  if (config.provider === "http-api") {
    if (!config.endpoint) {
      checks.push(check("http-endpoint", "服务地址", "fail", "未填写数字人 HTTP Endpoint"));
    } else {
      checks.push(check("http-endpoint", "服务地址", "pass", "已填写数字人 HTTP Endpoint"));
      if (request.network !== false) checks.push(await testHttpEndpoint(config));
    }
    if (!profile?.voiceId) checks.push(check("voice", "声音标识", "warn", "未填写声音标识，服务需自行选择默认声音"));
    if (!avatarPath) checks.push(check("avatar", "角色素材", "warn", "未填写角色参考素材路径，服务需自行选择默认角色"));
  }

  if (config.provider === "musetalk-cli") {
    const root = path.resolve(process.cwd(), "..", "external", "musetalk");
    checks.push(
      (await pathExists(root))
        ? check("musetalk-root", "MuseTalk", "pass", "已找到本地 MuseTalk 目录")
        : check("musetalk-root", "MuseTalk", "fail", "未找到 external/musetalk 目录"),
    );
    checks.push(
      avatarPath
        ? (await pathExists(avatarPath))
          ? check("avatar", "角色素材", "pass", "角色参考素材可读取")
          : check("avatar", "角色素材", "fail", "角色参考素材路径不可读取")
        : check("avatar", "角色素材", "fail", "未填写角色参考素材路径"),
    );
    checks.push(check("python", "Python", config.pythonPath ? "pass" : "fail", config.pythonPath || "未配置 Python"));
  }

  return checks;
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const data = typeof body === "object" && body !== null ? body as TestRequest : {};
  const config = await readConfig();
  const checks = await buildChecks(config, data);
  const productionReady = config.provider !== "placeholder" && checks.every((item) => item.status !== "fail");

  return Response.json(
    {
      provider: config.provider,
      brandId: data.brand?.id,
      roleName: data.brand?.digitalHuman?.roleName,
      productionReady,
      checks,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
