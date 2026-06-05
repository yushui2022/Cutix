import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const platformRoot = process.cwd();
const outputDir = path.join(platformRoot, "public", "output", "digital-human", "duix-adapter");
const jobDir = path.join(platformRoot, "data", "digital-human", "duix-adapter");

const host = process.env.DUIX_ADAPTER_HOST || "127.0.0.1";
const port = Number(process.env.DUIX_ADAPTER_PORT || process.env.PORT || "8789");
const duixApiBase = (process.env.DUIX_API_BASE || "http://127.0.0.1:8383").replace(/\/$/, "");
const duixSubmitUrl = process.env.DUIX_SUBMIT_URL || `${duixApiBase}/easy/submit`;
const duixQueryUrl = process.env.DUIX_QUERY_URL || `${duixApiBase}/easy/query`;

function sanitizeId(value) {
  return String(value || "duix")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "duix";
}

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
      if (raw.length > 1024 * 1024) {
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

function textField(payload, key) {
  return typeof payload[key] === "string" && payload[key].trim() ? payload[key].trim() : "";
}

function publicUrlToPath(value) {
  if (!value.startsWith("/output/")) return "";
  return path.join(platformRoot, "public", value.replace(/^\/+/, ""));
}

function audioPathFromPayload(payload) {
  const audioPath = textField(payload, "audioPath");
  if (audioPath) return audioPath;

  const audioUrl = textField(payload, "audioUrl");
  const resolved = audioUrl ? publicUrlToPath(audioUrl) : "";
  if (resolved) return resolved;

  throw new Error("audioPath or /output audioUrl is required");
}

function avatarPathFromPayload(payload) {
  const avatarPath = textField(payload, "avatarPath") || process.env.DUIX_AVATAR_PATH || "";
  if (avatarPath) return avatarPath;
  throw new Error("avatarPath or DUIX_AVATAR_PATH is required");
}

function pathToPosix(value) {
  return value.replace(/\\/g, "/");
}

function pathStartsWith(candidate, prefix) {
  const normalizedCandidate = path.resolve(candidate).toLowerCase();
  const normalizedPrefix = path.resolve(prefix).toLowerCase();
  return normalizedCandidate === normalizedPrefix || normalizedCandidate.startsWith(`${normalizedPrefix}${path.sep}`);
}

function mapHostPathToContainer(localPath, hostPrefix, containerPrefix) {
  if (!hostPrefix || !containerPrefix || !pathStartsWith(localPath, hostPrefix)) return "";
  const relative = path.relative(hostPrefix, localPath);
  return pathToPosix(path.posix.join(pathToPosix(containerPrefix), pathToPosix(relative)));
}

async function stageInputFile({
  localPath,
  code,
  kind,
  hostDir,
  containerDir,
  hostPrefix,
  containerPrefix,
}) {
  const mapped = mapHostPathToContainer(localPath, hostPrefix, containerPrefix);
  if (mapped) return mapped;

  if (!hostDir || !containerDir) return localPath;

  await fs.mkdir(hostDir, { recursive: true });
  const extension = path.extname(localPath) || (kind === "audio" ? ".wav" : ".mp4");
  const targetName = `${code}-${kind}${extension}`;
  const targetPath = path.join(hostDir, targetName);
  await fs.copyFile(localPath, targetPath);
  return pathToPosix(path.posix.join(pathToPosix(containerDir), targetName));
}

async function prepareDuixInputPaths(payload, code) {
  const audioPath = audioPathFromPayload(payload);
  const avatarPath = avatarPathFromPayload(payload);
  await fs.access(audioPath);
  await fs.access(avatarPath);

  const audioUrl = await stageInputFile({
    localPath: audioPath,
    code,
    kind: "audio",
    hostDir: process.env.DUIX_AUDIO_HOST_DIR || "",
    containerDir: process.env.DUIX_AUDIO_CONTAINER_DIR || "",
    hostPrefix: process.env.DUIX_AUDIO_HOST_PREFIX || "",
    containerPrefix: process.env.DUIX_AUDIO_CONTAINER_PREFIX || "",
  });

  const videoUrl = await stageInputFile({
    localPath: avatarPath,
    code,
    kind: "avatar",
    hostDir: process.env.DUIX_VIDEO_HOST_DIR || "",
    containerDir: process.env.DUIX_VIDEO_CONTAINER_DIR || "",
    hostPrefix: process.env.DUIX_VIDEO_HOST_PREFIX || "",
    containerPrefix: process.env.DUIX_VIDEO_CONTAINER_PREFIX || "",
  });

  return { audioUrl, videoUrl, audioPath, avatarPath };
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function duixPayloadFromCutix(payload, code, inputPaths) {
  return {
    audio_url: inputPaths.audioUrl,
    video_url: inputPaths.videoUrl,
    code,
    chaofen: numberEnv("DUIX_CHAOFEN", 0),
    watermark_switch: numberEnv("DUIX_WATERMARK_SWITCH", 0),
    pn: numberEnv("DUIX_PN", 1),
    text: textField(payload, "text"),
    brand_id: textField(payload, "brandId"),
    brand_name: textField(payload, "brandName"),
    role_name: textField(payload, "roleName"),
    voice_id: textField(payload, "voiceId"),
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: init?.signal || AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return body;
}

async function writeJob(code, data) {
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, `${code}.json`), JSON.stringify(data, null, 2), "utf8");
}

async function readJob(code) {
  try {
    const raw = await fs.readFile(path.join(jobDir, `${code}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function nestedPayload(payload) {
  if (payload && typeof payload === "object") {
    if (payload.data && typeof payload.data === "object") return payload.data;
    if (payload.result && typeof payload.result === "object") return payload.result;
  }
  return payload && typeof payload === "object" ? payload : {};
}

function resultField(payload) {
  const data = nestedPayload(payload);
  const keys = ["videoUrl", "video_url", "alphaVideoUrl", "alpha_video_url", "result", "url", "path", "output", "output_url"];
  for (const key of keys) {
    const value = typeof data[key] === "string" && data[key].trim()
      ? data[key].trim()
      : typeof payload[key] === "string" && payload[key].trim()
        ? payload[key].trim()
        : "";
    if (value) return value;
  }
  return "";
}

function statusField(payload) {
  const data = nestedPayload(payload);
  const value = data.status ?? payload.status ?? data.state ?? payload.state;
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function errorField(payload) {
  const data = nestedPayload(payload);
  return data.error || payload.error || data.message || payload.message || data.msg || payload.msg || "Duix job failed";
}

function mapContainerResultToHost(value) {
  const hostDir = process.env.DUIX_RESULT_HOST_DIR || "";
  const containerDir = process.env.DUIX_RESULT_CONTAINER_DIR || "";
  if (!hostDir || !containerDir) return "";

  const normalizedValue = pathToPosix(value);
  const normalizedContainer = pathToPosix(containerDir).replace(/\/$/, "");
  if (!normalizedValue.startsWith(`${normalizedContainer}/`) && normalizedValue !== normalizedContainer) return "";

  const relative = normalizedValue.slice(normalizedContainer.length).replace(/^\/+/, "");
  return path.join(hostDir, relative);
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(value);
}

async function copyResultToPublic(resultValue, code) {
  if (resultValue.startsWith("/output/") || isRemoteUrl(resultValue)) return resultValue;

  const mappedHostPath = mapContainerResultToHost(resultValue);
  const candidatePath = mappedHostPath || resultValue;
  try {
    await fs.access(candidatePath);
  } catch {
    return resultValue;
  }

  await fs.mkdir(outputDir, { recursive: true });
  const extension = path.extname(candidatePath) || ".mp4";
  const publicName = `${sanitizeId(code)}${extension}`;
  const publicPath = path.join(outputDir, publicName);
  await fs.copyFile(candidatePath, publicPath);
  return `/output/digital-human/duix-adapter/${publicName}`;
}

function statusUrlFor(code) {
  return `http://${host}:${port}/jobs/${encodeURIComponent(code)}`;
}

async function submitDuixJob(payload) {
  const sceneId = sanitizeId(payload.sceneId);
  const code = `${sceneId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const inputPaths = await prepareDuixInputPaths(payload, code);
  const duixPayload = duixPayloadFromCutix(payload, code, inputPaths);
  const submittedAt = new Date().toISOString();

  const submitResponse = await fetchJson(duixSubmitUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(duixPayload),
  });

  await writeJob(code, {
    code,
    sceneId: payload.sceneId,
    durationMs: payload.durationMs,
    inputPaths,
    duixPayload,
    submitResponse,
    submittedAt,
  });

  return {
    jobId: code,
    status: "queued",
    provider: "duix-adapter",
    statusUrl: statusUrlFor(code),
  };
}

async function queryDuixJob(code) {
  const url = new URL(duixQueryUrl);
  url.searchParams.set("code", code);
  const payload = await fetchJson(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const job = await readJob(code);
  const rawResult = resultField(payload);
  if (rawResult) {
    const videoUrl = await copyResultToPublic(rawResult, code);
    return {
      status: "completed",
      jobId: code,
      provider: "duix-adapter",
      videoUrl,
      sourceVideoUrl: rawResult,
      durationMs: typeof job.durationMs === "number" ? job.durationMs : undefined,
      alpha: false,
    };
  }

  const status = statusField(payload);
  if (status === 3 || ["failed", "failure", "error", "canceled", "cancelled"].includes(status)) {
    return {
      status: "failed",
      jobId: code,
      error: String(errorField(payload)),
    };
  }

  return {
    status: status === 2 || ["completed", "complete", "success", "done"].includes(status)
      ? "completed"
      : "running",
    jobId: code,
    provider: "duix-adapter",
    progress: nestedPayload(payload).progress ?? payload.progress,
  };
}

async function writableDirectory(key, label, target) {
  const probePath = path.join(target, `.cutix-health-${Date.now()}.tmp`);
  try {
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(probePath, "ok", "utf8");
    await fs.unlink(probePath);
    return { key, label, status: "pass", target, message: "writable" };
  } catch (error) {
    return {
      key,
      label,
      status: "fail",
      target,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function endpointReachable() {
  try {
    const url = new URL(duixQueryUrl);
    url.searchParams.set("code", "__cutix_health__");
    await fetchJson(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    return { key: "duix-api", label: "Duix API", status: "pass", target: duixApiBase, message: "reachable" };
  } catch (error) {
    const allowUnreachable = process.env.DUIX_HEALTH_ALLOW_UNREACHABLE === "1";
    return {
      key: "duix-api",
      label: "Duix API",
      status: allowUnreachable ? "warn" : "fail",
      target: duixApiBase,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function healthPayload() {
  const checks = [
    await writableDirectory("outputDir", "adapter output", outputDir),
    await writableDirectory("jobDir", "adapter jobs", jobDir),
    await endpointReachable(),
  ];

  for (const [key, label, target] of [
    ["audioStage", "audio staging", process.env.DUIX_AUDIO_HOST_DIR || ""],
    ["videoStage", "avatar staging", process.env.DUIX_VIDEO_HOST_DIR || ""],
    ["resultDir", "result mapping", process.env.DUIX_RESULT_HOST_DIR || ""],
  ]) {
    if (target) checks.push(await writableDirectory(key, label, target));
  }

  return {
    service: "cutix-duix-http-adapter",
    ok: checks.every((check) => check.status !== "fail"),
    endpoint: `http://${host}:${port}/generate`,
    generateEndpoint: `http://${host}:${port}/generate`,
    healthEndpoint: `http://${host}:${port}/health`,
    duixSubmitUrl,
    duixQueryUrl,
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

    if (request.method === "POST" && url.pathname === "/generate") {
      const payload = await readRequestBody(request);
      jsonResponse(response, 200, await submitDuixJob(payload));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/jobs/")) {
      const code = decodeURIComponent(url.pathname.replace(/^\/jobs\//, ""));
      jsonResponse(response, 200, await queryDuixJob(code));
      return;
    }

    jsonResponse(response, 404, { error: "Not found" });
  } catch (error) {
    jsonResponse(response, 500, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`[duix-adapter] listening at http://${host}:${port}`);
  console.log(`[duix-adapter] generate endpoint http://${host}:${port}/generate`);
  console.log(`[duix-adapter] forwarding to ${duixSubmitUrl}`);
});
