import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DigitalHumanProvider = "placeholder" | "musetalk-cli" | "http-api" | "heygen-api";

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

type ServiceHealthCheck = {
  key?: unknown;
  label?: unknown;
  status?: unknown;
  message?: unknown;
  target?: unknown;
};

type ServiceHealthPayload = {
  service?: unknown;
  ok?: unknown;
  endpoint?: unknown;
  generateEndpoint?: unknown;
  healthEndpoint?: unknown;
  checks?: unknown;
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
  if (value === "musetalk-cli" || value === "http-api" || value === "heygen-api") return value;
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

function normalizeCheckStatus(value: unknown): ReadinessCheck["status"] {
  if (value === "pass" || value === "warn" || value === "fail") return value;
  if (value === true || value === "ok" || value === "ready") return "pass";
  if (value === false || value === "error") return "fail";
  return "warn";
}

function asText(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function healthUrlCandidates(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const pathWithoutSlash = url.pathname.replace(/\/+$/, "");
    const candidates: string[] = [];

    if (pathWithoutSlash.endsWith("/generate")) {
      const healthUrl = new URL(url);
      healthUrl.pathname = `${pathWithoutSlash.slice(0, -"/generate".length) || ""}/health`;
      healthUrl.search = "";
      candidates.push(healthUrl.toString());
    }

    if (pathWithoutSlash && pathWithoutSlash !== "/") {
      const scopedHealthUrl = new URL(url);
      const parentPath = pathWithoutSlash.split("/").slice(0, -1).join("/");
      scopedHealthUrl.pathname = `${parentPath || ""}/health`;
      scopedHealthUrl.search = "";
      candidates.push(scopedHealthUrl.toString());
    }

    const rootHealthUrl = new URL(url);
    rootHealthUrl.pathname = "/health";
    rootHealthUrl.search = "";
    candidates.push(rootHealthUrl.toString());

    return unique(candidates);
  } catch {
    return [];
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function flattenHealthPayload(payload: ServiceHealthPayload, healthUrl: string): ReadinessCheck[] {
  const serviceName = asText(payload.service) || "本地数字人服务";
  const ok = payload.ok === true;
  const checks: ReadinessCheck[] = [
    check(
      "http-health",
      "服务健康检查",
      ok ? "pass" : "fail",
      ok ? `${serviceName} 已就绪：${healthUrl}` : `${serviceName} 未就绪：${healthUrl}`,
    ),
  ];

  if (Array.isArray(payload.checks)) {
    payload.checks.forEach((item, index) => {
      const serviceCheck = item as ServiceHealthCheck;
      const key = asText(serviceCheck.key) || `service-${index + 1}`;
      const label = asText(serviceCheck.label) || key;
      const target = asText(serviceCheck.target);
      const message = asText(serviceCheck.message) || (target ? target : "服务未返回详细信息");
      checks.push(check(`service-${key}`, label, normalizeCheckStatus(serviceCheck.status), target ? `${message}：${target}` : message));
    });
  }

  return checks;
}

async function tryServiceHealth(config: StoredDigitalHumanConfig): Promise<ReadinessCheck[] | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  for (const healthUrl of healthUrlCandidates(config.endpoint)) {
    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 404 || response.status === 405) continue;
      if (response.status === 401 || response.status === 403) {
        return [check("http-health", "服务健康检查", "fail", `健康检查鉴权失败，HTTP ${response.status}`)];
      }
      if (response.status >= 500) {
        return [check("http-health", "服务健康检查", "fail", `健康检查返回 HTTP ${response.status}`)];
      }
      if (!response.ok) continue;

      const payload = await readJson(response);
      if (typeof payload === "object" && payload !== null) {
        const healthPayload = payload as ServiceHealthPayload;
        if (Array.isArray(healthPayload.checks) || "ok" in healthPayload) {
          return flattenHealthPayload(healthPayload, healthUrl);
        }
      }

      return [check("http-health", "服务健康检查", "warn", `健康检查有响应，但未返回标准 JSON：${healthUrl}`)];
    } catch {
      // Try the next health URL candidate before falling back to the endpoint probe.
    }
  }

  return null;
}

async function testHttpEndpoint(config: StoredDigitalHumanConfig): Promise<ReadinessCheck[]> {
  const healthChecks = await tryServiceHealth(config);
  if (healthChecks) return healthChecks;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  try {
    const response = await fetch(config.endpoint, {
      method: "OPTIONS",
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 404) {
      return [check("http-network", "服务响应", "fail", "服务地址返回 HTTP 404，请确认 endpoint 是否应指向 /generate")];
    }
    if (response.status === 401 || response.status === 403) {
      return [check("http-network", "服务响应", "fail", `服务鉴权失败，HTTP ${response.status}`)];
    }
    if (response.status >= 500) {
      return [check("http-network", "服务响应", "fail", `服务返回 HTTP ${response.status}`)];
    }
    if (response.status === 405) {
      return [check("http-network", "服务响应", "warn", "服务存活但不支持 OPTIONS；建议实现 /health 以确认生产依赖")];
    }

    return [check("http-network", "服务响应", "pass", `服务有响应，HTTP ${response.status}`)];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return [check("http-network", "服务响应", "fail", `无法连接数字人服务：${message}`)];
  }
}

async function testHeyGenEndpoint(config: StoredDigitalHumanConfig): Promise<ReadinessCheck> {
  const baseUrl = (config.endpoint || "https://api.heygen.com").replace(/\/$/, "");
  if (!config.apiKey) return check("heygen-key", "API Key", "fail", "未填写 HeyGen API Key");

  try {
    const response = await fetch(`${baseUrl}/v2/avatars`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-KEY": config.apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401 || response.status === 403) {
      return check("heygen-network", "HeyGen 鉴权", "fail", `HeyGen 返回 HTTP ${response.status}`);
    }
    if (response.status >= 500) {
      return check("heygen-network", "HeyGen 服务", "fail", `HeyGen 返回 HTTP ${response.status}`);
    }

    return check("heygen-network", "HeyGen 服务", "pass", `HeyGen 有响应，HTTP ${response.status}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return check("heygen-network", "HeyGen 服务", "fail", `无法连接 HeyGen：${message}`);
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

  if (config.provider === "heygen-api") {
    checks[checks.length - 1] = check("provider", "生产接入", "pass", "HeyGen API");
    checks.push(
      avatarPath
        ? check("avatar", "HeyGen Avatar Pose ID", "pass", "已填写 HeyGen avatar_pose_id")
        : check("avatar", "HeyGen Avatar Pose ID", "fail", "未填写 HeyGen avatar_pose_id"),
    );
    checks.push(
      config.apiKey
        ? check("api-key", "API Key", "pass", "已保存 HeyGen API Key")
        : check("api-key", "API Key", "fail", "未填写 HeyGen API Key"),
    );
    checks.push(check("delivery-policy", "交付策略", "warn", "HeyGen 调用云端服务，只用于效果参考；本地化交付需使用 MuseTalk 或本地 HTTP 服务"));
    if (request.network !== false) checks.push(await testHeyGenEndpoint(config));
  }

  if (config.provider === "http-api") {
    if (!config.endpoint) {
      checks.push(check("http-endpoint", "服务地址", "fail", "未填写数字人 HTTP Endpoint"));
    } else {
      checks.push(check("http-endpoint", "服务地址", "pass", "已填写数字人 HTTP Endpoint"));
      if (request.network !== false) checks.push(...(await testHttpEndpoint(config)));
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
  const productionReady =
    config.provider !== "placeholder"
    && config.provider !== "heygen-api"
    && checks.every((item) => item.status !== "fail");

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
