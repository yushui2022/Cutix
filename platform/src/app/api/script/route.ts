import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import { buildVideoPlan, validateVideoPlan, type VideoPlan } from "@/lib/video-plan-schema";

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

type ScriptScene = {
  id: string;
  role: "hook" | "pain" | "solution" | "proof" | "cta";
  layout: "full_dh" | "dh_top_broll_bottom" | "broll_top_dh_bottom" | "full_broll";
  durationSec: number;
  copy: string;
  visualTags: string[];
  needsDigitalHuman: boolean;
};

type GeneratedScript = {
  title: string;
  platform: string;
  brandId: string;
  templateId: string;
  tone: string;
  scenes: ScriptScene[];
  cta: string;
  videoPlan: VideoPlan;
};

type ScriptRequest = {
  brand?: {
    id: string;
    name: string;
    industry: string;
    tone: string;
    promise: string;
  };
  template?: {
    id: string;
    name: string;
    layout: string;
    bestFor: string;
  };
  targetPlatform?: string;
  copyMode?: string;
  assetTags?: string[];
  useLlm?: boolean;
};

const llmConfigFile = path.join(process.cwd(), "data", "llm-config.json");
const videoPlanDir = path.join(process.cwd(), "data", "video-plans");

const defaultLlmConfig: StoredLlmConfig = {
  provider: "openai-compatible",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "qwen2.5:7b",
  temperature: 0.7,
};

async function readLlmConfig(): Promise<StoredLlmConfig> {
  try {
    const raw = await fs.readFile(llmConfigFile, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultLlmConfig;
    const data = parsed as Record<string, unknown>;
    return {
      provider: data.provider === "ollama" || data.provider === "vllm" || data.provider === "custom"
        ? data.provider
        : "openai-compatible",
      baseUrl: typeof data.baseUrl === "string" && data.baseUrl ? data.baseUrl : defaultLlmConfig.baseUrl,
      model: typeof data.model === "string" && data.model ? data.model : defaultLlmConfig.model,
      temperature: typeof data.temperature === "number" ? data.temperature : defaultLlmConfig.temperature,
      apiKey: typeof data.apiKey === "string" && data.apiKey ? data.apiKey : undefined,
    };
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return defaultLlmConfig;
    }
    throw error;
  }
}

function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 8);
}

function attachVideoPlan(script: Omit<GeneratedScript, "videoPlan">, input: Required<ScriptRequest>): GeneratedScript {
  const videoPlan = buildVideoPlan(script, {
    brand: input.brand,
    template: input.template,
    targetPlatform: input.targetPlatform,
  });
  const validation = validateVideoPlan(videoPlan, script);
  if (!validation.valid) {
    throw new Error(`videoPlan failed internal schema validation: ${validation.issues.join("; ")}`);
  }

  return {
    ...script,
    videoPlan,
  };
}

function localScript(input: Required<ScriptRequest>): GeneratedScript {
  const brand = input.brand;
  const template = input.template;
  const tags = uniqueTags(input.assetTags);
  const primaryTags = tags.length ? tags.join("、") : "门店、产品、案例";

  return attachVideoPlan({
    title: `${brand.name}${input.targetPlatform}短视频脚本`,
    platform: input.targetPlatform,
    brandId: brand.id,
    templateId: template.id,
    tone: brand.tone,
    scenes: [
      {
        id: "hook",
        role: "hook",
        layout: "full_dh",
        durationSec: 5,
        copy: `${brand.industry}老板最该先解决的，不是流量，而是可复制的成交路径。`,
        visualTags: ["数字人", "开场", ...tags.slice(0, 2)],
        needsDigitalHuman: true,
      },
      {
        id: "pain",
        role: "pain",
        layout: "dh_top_broll_bottom",
        durationSec: 8,
        copy: `很多内容拍了不少，但素材没有围绕${primaryTags}组织，用户看完也不知道为什么要信你。`,
        visualTags: uniqueTags(["痛点", "门店", "人流", ...tags]),
        needsDigitalHuman: true,
      },
      {
        id: "solution",
        role: "solution",
        layout: "broll_top_dh_bottom",
        durationSec: 8,
        copy: `${brand.name}的表达重点是：${brand.promise}。每个镜头都要服务这个结论。`,
        visualTags: uniqueTags(["方案", "产品", "服务", ...tags]),
        needsDigitalHuman: true,
      },
      {
        id: "proof",
        role: "proof",
        layout: "full_broll",
        durationSec: 6,
        copy: `用真实素材、场景细节和结果证明，把卖点变成可信证据。`,
        visualTags: uniqueTags(["案例", "证明", "数据", ...tags]),
        needsDigitalHuman: false,
      },
      {
        id: "cta",
        role: "cta",
        layout: "full_dh",
        durationSec: 5,
        copy: `想拿到这套${brand.industry}视频脚本和素材组合方案，现在就私信关键词“方案”。`,
        visualTags: ["数字人", "CTA", "结尾"],
        needsDigitalHuman: true,
      },
    ],
    cta: "私信关键词“方案”",
  }, input);
}

function normalizeRequest(body: unknown): Required<ScriptRequest> {
  const data = typeof body === "object" && body !== null ? body as ScriptRequest : {};
  return {
    brand: data.brand ?? {
      id: "wang",
      name: "老王餐饮",
      industry: "餐饮招商加盟",
      tone: "专业、直接、有紧迫感",
      promise: "突出回本模型、门店复制和招商转化",
    },
    template: data.template ?? {
      id: "split",
      name: "数字人 + 素材分屏",
      layout: "数字人在上，素材在下",
      bestFor: "招商、口播、IP 短视频",
    },
    targetPlatform: data.targetPlatform ?? "抖音",
    copyMode: data.copyMode ?? "auto",
    assetTags: Array.isArray(data.assetTags) ? data.assetTags.map(String) : [],
    useLlm: data.useLlm === true,
  };
}

function normalizeSceneLayout(value: unknown): ScriptScene["layout"] | null {
  if (
    value === "full_dh"
    || value === "dh_top_broll_bottom"
    || value === "broll_top_dh_bottom"
    || value === "full_broll"
  ) {
    return value;
  }
  return null;
}

function normalizeSceneRole(value: unknown): ScriptScene["role"] | null {
  if (value === "hook" || value === "pain" || value === "solution" || value === "proof" || value === "cta") {
    return value;
  }
  return null;
}

function validateScript(value: unknown, input: Required<ScriptRequest>): GeneratedScript | null {
  if (typeof value !== "object" || value === null) return null;
  const rawScript = value as Record<string, unknown>;
  const rawScenes = rawScript.scenes;
  const title = rawScript.title;
  const platform = rawScript.platform;
  if (typeof title !== "string") return null;
  if (typeof platform !== "string") return null;
  if (!Array.isArray(rawScenes) || rawScenes.length < 3) return null;

  const scenes: ScriptScene[] = [];
  for (const scene of rawScenes) {
    if (typeof scene !== "object" || scene === null) return null;
    const rawScene = scene as Record<string, unknown>;
    const role = normalizeSceneRole(rawScene.role);
    const layout = normalizeSceneLayout(rawScene.layout);
    if (!role || !layout) return null;
    if (typeof rawScene.id !== "string" || typeof rawScene.copy !== "string") return null;
    if (typeof rawScene.durationSec !== "number" || rawScene.durationSec <= 0) return null;
    if (!Array.isArray(rawScene.visualTags)) return null;
    if (typeof rawScene.needsDigitalHuman !== "boolean") return null;
    scenes.push({
      id: rawScene.id,
      role,
      layout,
      durationSec: Math.max(3, Math.min(15, Math.round(rawScene.durationSec))),
      copy: rawScene.copy,
      visualTags: uniqueTags(rawScene.visualTags.map(String)),
      needsDigitalHuman: rawScene.needsDigitalHuman,
    });
  }

  const normalized = {
    title,
    platform,
    brandId: typeof rawScript.brandId === "string" ? rawScript.brandId : input.brand.id,
    templateId: typeof rawScript.templateId === "string" ? rawScript.templateId : input.template.id,
    tone: typeof rawScript.tone === "string" ? rawScript.tone : input.brand.tone,
    scenes,
    cta: typeof rawScript.cta === "string" ? rawScript.cta : "私信了解方案",
  };

  return attachVideoPlan(normalized, input);
}

async function callLlm(input: Required<ScriptRequest>) {
  const config = await readLlmConfig();
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const prompt = [
    "你是商业短视频自动剪辑系统的分镜脚本生成器。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "JSON 必须包含 title, platform, brandId, templateId, tone, scenes, cta。",
    "scenes 每项必须包含 id, role, layout, durationSec, copy, visualTags, needsDigitalHuman。",
    "role 只能是 hook/pain/solution/proof/cta。",
    "layout 只能是 full_dh/dh_top_broll_bottom/broll_top_dh_bottom/full_broll。",
    "你要把文案和画面编排一起考虑：每个 scene 的 layout 必须按内容节奏变化，不要固定单一上下布局。",
    "需要数字人讲话的段落把 needsDigitalHuman 设为 true；纯素材证明段可设为 false。",
    `品牌：${JSON.stringify(input.brand)}`,
    `模板：${JSON.stringify(input.template)}`,
    `平台：${input.targetPlatform}`,
    `文案模式：${input.copyMode}`,
    `可用素材标签：${input.assetTags.join("、") || "暂无"}`,
  ].join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你输出严格 JSON，用中文写商业短视频脚本。" },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${await response.text()}`);
  const payload: unknown = await response.json();
  const content = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM response has no message content");

  const parsed: unknown = JSON.parse(content);
  const script = validateScript(parsed, input);
  if (!script) throw new Error("LLM script JSON failed validation");
  return script;
}

async function persistVideoPlan(
  source: "local-rules" | "llm" | "local-fallback",
  script: GeneratedScript,
  llmError?: string,
) {
  await fs.mkdir(videoPlanDir, { recursive: true });
  await fs.writeFile(
    path.join(videoPlanDir, `${script.videoPlan.id}.json`),
    JSON.stringify({
      source,
      llmError,
      savedAt: new Date().toISOString(),
      script,
    }, null, 2),
    "utf8",
  );
}

export async function POST(request: NextRequest) {
  const input = normalizeRequest(await request.json());
  const fallback = localScript(input);

  if (!input.useLlm) {
    await persistVideoPlan("local-rules", fallback);
    return Response.json({ source: "local-rules", script: fallback });
  }

  try {
    const script = await callLlm(input);
    await persistVideoPlan("llm", script);
    return Response.json({ source: "llm", script });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown LLM error";
    await persistVideoPlan("local-fallback", fallback, message);
    return Response.json({ source: "local-fallback", llmError: message, script: fallback });
  }
}
