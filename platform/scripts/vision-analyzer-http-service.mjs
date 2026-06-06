import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const platformRoot = process.cwd();
const publicRoot = path.join(platformRoot, "public");
const host = process.env.VISION_ANALYZER_HOST || "127.0.0.1";
const port = Number(process.env.VISION_ANALYZER_PORT || process.env.PORT || "8890");
const baseUrl = (process.env.VISION_ANALYZER_BASE_URL || process.env.OPENAI_BASE_URL || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
const chatUrl = process.env.VISION_ANALYZER_CHAT_URL || `${baseUrl}/chat/completions`;
const model = process.env.VISION_ANALYZER_MODEL || "qwen2.5vl:7b";
const apiKey = process.env.VISION_ANALYZER_API_KEY || process.env.OPENAI_API_KEY || "";
const maxFrames = Math.max(1, Number(process.env.VISION_ANALYZER_MAX_FRAMES || "4"));
const timeoutMs = Math.max(5000, Number(process.env.VISION_ANALYZER_TIMEOUT_MS || "120000"));

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!raw.trim()) resolve({});
      else {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      }
    });
    request.on("error", reject);
  });
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function stringField(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function pathStartsWith(candidate, prefix) {
  const normalizedCandidate = path.resolve(candidate).toLowerCase();
  const normalizedPrefix = path.resolve(prefix).toLowerCase();
  return normalizedCandidate === normalizedPrefix || normalizedCandidate.startsWith(`${normalizedPrefix}${path.sep}`);
}

function allowedFrameRoots() {
  const extraRoots = String(process.env.VISION_ANALYZER_FRAME_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  return [publicRoot, ...extraRoots.map((item) => path.resolve(item))];
}

function resolveFramePath(frame) {
  const framePath = isObject(frame) ? stringField(frame.path) : "";
  if (!framePath) throw new Error("frame.path is required");

  const resolved = path.resolve(framePath);
  if (process.env.VISION_ANALYZER_ALLOW_OUTSIDE_PUBLIC === "1") return resolved;

  const allowed = allowedFrameRoots();
  if (!allowed.some((root) => pathStartsWith(resolved, root))) {
    throw new Error(`Frame path is outside allowed roots: ${resolved}`);
  }
  return resolved;
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

async function frameToDataUrl(frame) {
  const filePath = resolveFramePath(frame);
  const buffer = await fs.readFile(filePath);
  return `data:${mimeTypeFor(filePath)};base64,${buffer.toString("base64")}`;
}

function normalizeTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,，、\n]/u)
      : [];
  return Array.from(
    new Set(
      rawTags
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .map((tag) => tag.replace(/^#/, "")),
    ),
  ).slice(0, 12);
}

const metadataTagRules = [
  { pattern: /门店|店铺|客流|store|shop|traffic|restaurant|retail/iu, tags: ["门店", "客流"] },
  { pattern: /产品|商品|包装|product|goods|package/iu, tags: ["产品", "展示"] },
  { pattern: /招商|加盟|business|franchise|brand/iu, tags: ["招商", "商业IP"] },
  { pattern: /口播|数字人|avatar|talking|presenter|spokesperson/iu, tags: ["数字人", "口播"] },
  { pattern: /活动|节日|促销|event|sale|festival/iu, tags: ["活动", "促销"] },
  { pattern: /案例|客户|数据|case|proof|result/iu, tags: ["案例", "证明"] },
  { pattern: /logo|品牌|brand/iu, tags: ["品牌"] },
  { pattern: /bgm|music|audio|voice|声音/iu, tags: ["音频"] },
];

function fallbackTagsFromMetadata(payload) {
  const asset = isObject(payload.asset) ? payload.asset : {};
  const text = [
    stringField(asset.name),
    stringField(asset.type),
    stringField(asset.orientation),
    stringField(asset.duration),
    ...(Array.isArray(asset.tags) ? asset.tags.map((tag) => String(tag)) : []),
  ].join(" ");
  const tags = [];

  for (const rule of metadataTagRules) {
    if (rule.pattern.test(text)) tags.push(...rule.tags);
  }

  if (asset.type === "video") tags.push("视频");
  if (asset.type === "image") tags.push("图片");
  if (asset.type === "avatar") tags.push("数字人");
  if (asset.orientation === "9:16") tags.push("竖屏");
  if (asset.orientation === "16:9") tags.push("横屏");

  return normalizeTags([...(Array.isArray(asset.tags) ? asset.tags : []), ...tags]);
}

function extractJsonObject(text) {
  const raw = stringField(text);
  if (!raw) throw new Error("Vision model returned empty content");

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  const candidate = fenced ? fenced[1] : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error(`Vision model did not return a JSON object: ${raw.slice(0, 300)}`);
  }
}

function normalizeVisionResult(value, provider) {
  if (!isObject(value)) throw new Error("Vision model result must be an object");
  const tags = normalizeTags(value.tags);
  return {
    tags,
    summary: stringField(value.summary),
    provider: stringField(value.provider) || provider,
  };
}

function parseVisionModelResponse(text, provider) {
  return normalizeVisionResult(extractJsonObject(text), provider);
}

function buildPrompt(payload) {
  const asset = isObject(payload.asset) ? payload.asset : {};
  return [
    "你是 Cutix 的本地素材视觉打标服务。",
    "请根据素材元信息和关键帧，输出严格 JSON，不要输出 Markdown。",
    "JSON 格式：{\"tags\":[\"标签1\"],\"summary\":\"一句中文摘要\",\"provider\":\"local-vision\"}",
    "标签要求：4-12 个短标签，优先使用中文，覆盖场景、人物、产品、情绪、镜头类型、用途、平台或横竖屏。",
    "不要编造看不见的信息；不确定时用较泛化标签。",
    `素材名称：${stringField(asset.name) || "未命名"}`,
    `素材类型：${stringField(asset.type) || "unknown"}`,
    `已有标签：${Array.isArray(asset.tags) ? asset.tags.join("、") : "无"}`,
    `方向：${stringField(asset.orientation) || "unknown"}`,
    `时长：${stringField(asset.duration) || "unknown"}`,
  ].join("\n");
}

async function callVisionModel(payload) {
  const frames = Array.isArray(payload.frames) ? payload.frames.slice(0, maxFrames) : [];
  if (frames.length === 0) {
    return {
      tags: fallbackTagsFromMetadata(payload),
      summary: "未提供关键帧，已按素材元信息生成基础标签。",
      provider: "local-vision-metadata-fallback",
    };
  }

  if (process.env.VISION_ANALYZER_RULES_ONLY === "1") {
    return {
      tags: fallbackTagsFromMetadata(payload),
      summary: "已按素材元信息生成基础标签，未调用视觉模型。",
      provider: "local-vision-rules-only",
    };
  }

  const dataUrls = await Promise.all(frames.map(frameToDataUrl));
  const provider = `local-vision:${model}`;
  const body = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: "You return strict JSON for local video asset tagging.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: buildPrompt(payload) },
          ...dataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      },
    ],
  };

  if (process.env.VISION_ANALYZER_JSON_MODE !== "0") {
    body.response_format = { type: "json_object" };
  }

  const headers = { "content-type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(chatUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Vision model HTTP ${response.status}: ${text}`);

  const json = text.trim() ? JSON.parse(text) : {};
  const content = json?.choices?.[0]?.message?.content;
  return parseVisionModelResponse(content, provider);
}

async function healthPayload() {
  const checks = [
    {
      key: "frame-root",
      label: "frame root",
      status: "pass",
      target: allowedFrameRoots().join(path.delimiter),
      message: "configured",
    },
    {
      key: "vision-model",
      label: "vision model",
      status: process.env.VISION_ANALYZER_RULES_ONLY === "1" ? "warn" : "pass",
      target: chatUrl,
      message: process.env.VISION_ANALYZER_RULES_ONLY === "1" ? "rules-only mode" : model,
    },
  ];

  return {
    service: "cutix-local-vision-analyzer",
    ok: checks.every((check) => check.status !== "fail"),
    endpoint: `http://${host}:${port}/analyze`,
    analyzeEndpoint: `http://${host}:${port}/analyze`,
    healthEndpoint: `http://${host}:${port}/health`,
    model,
    chatUrl,
    maxFrames,
    checks,
  };
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      jsonResponse(response, 200, await healthPayload());
      return;
    }

    if (request.method === "POST" && url.pathname === "/analyze") {
      const payload = await readRequestBody(request);
      const result = await callVisionModel(payload);
      jsonResponse(response, 200, result);
      return;
    }

    jsonResponse(response, 404, { error: "Not found" });
  } catch (error) {
    jsonResponse(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export {
  buildPrompt,
  fallbackTagsFromMetadata,
  normalizeTags,
  normalizeVisionResult,
  parseVisionModelResponse,
  resolveFramePath,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, host, () => {
    console.log(`[vision-analyzer] listening at http://${host}:${port}`);
    console.log(`[vision-analyzer] analyze endpoint http://${host}:${port}/analyze`);
    console.log(`[vision-analyzer] model ${model}`);
    console.log(`[vision-analyzer] chat endpoint ${chatUrl}`);
  });
}
