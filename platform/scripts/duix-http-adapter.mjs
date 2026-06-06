import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

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

const resultKeys = [
  "alphaVideoUrl",
  "alpha_video_url",
  "videoUrl",
  "video_url",
  "videoPath",
  "video_path",
  "resultUrl",
  "result_url",
  "resultPath",
  "result_path",
  "downloadUrl",
  "download_url",
  "outputUrl",
  "output_url",
  "outputPath",
  "output_path",
  "filePath",
  "file_path",
  "file",
  "url",
  "path",
  "output",
  "result",
];

const statusKeys = [
  "status",
  "state",
  "taskStatus",
  "task_status",
  "jobStatus",
  "job_status",
  "statusCode",
  "status_code",
];

const progressKeys = ["progress", "percent", "percentage", "ratio"];
const errorKeys = ["error", "message", "msg", "reason", "detail"];

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function stringFromValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function findValueByKeys(payload, keys, maxDepth = 5) {
  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !isObject(current.value) || current.depth > maxDepth || seen.has(current.value)) continue;
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      for (const item of current.value) queue.push({ value: item, depth: current.depth + 1 });
      continue;
    }

    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(current.value, key)) continue;
      const candidate = current.value[key];
      if (candidate === undefined || candidate === null) continue;
      if (typeof candidate === "string" && !candidate.trim()) continue;
      return candidate;
    }

    for (const value of Object.values(current.value)) {
      if (isObject(value)) queue.push({ value, depth: current.depth + 1 });
    }
  }

  return undefined;
}

function isLikelyResultReference(value) {
  const text = stringFromValue(value);
  if (!text) return false;

  const normalized = text.toLowerCase();
  if (["ok", "true", "success", "succeed", "completed", "complete", "done", "finished"].includes(normalized)) {
    return false;
  }

  return (
    isRemoteUrl(text)
    || text.startsWith("/output/")
    || /\.(mp4|webm|mov|mkv|avi|m3u8)(\?|$)/iu.test(text)
    || /[\\/]/u.test(text)
  );
}

function findResultReferenceByKeys(payload, keys, maxDepth = 5) {
  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !isObject(current.value) || current.depth > maxDepth || seen.has(current.value)) continue;
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      for (const item of current.value) queue.push({ value: item, depth: current.depth + 1 });
      continue;
    }

    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(current.value, key)) continue;
      const candidate = current.value[key];
      if (isLikelyResultReference(candidate)) return stringFromValue(candidate);
    }

    for (const value of Object.values(current.value)) {
      if (isObject(value)) queue.push({ value, depth: current.depth + 1 });
    }
  }

  return "";
}

function resultField(payload) {
  const data = nestedPayload(payload);
  for (const key of resultKeys) {
    const value = typeof data[key] === "string" && data[key].trim()
      ? data[key].trim()
      : typeof payload[key] === "string" && payload[key].trim()
        ? payload[key].trim()
        : "";
    if (isLikelyResultReference(value)) return value;
  }

  return findResultReferenceByKeys(payload, resultKeys);
}

function normalizeStatusValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();
  if (/^-?\d+$/u.test(normalized)) return Number(normalized);
  return normalized;
}

function statusField(payload) {
  const data = nestedPayload(payload);
  const value = findValueByKeys([data, payload], statusKeys, 3);
  return normalizeStatusValue(value);
}

function errorField(payload) {
  const data = nestedPayload(payload);
  const value = findValueByKeys([data, payload], errorKeys, 4);
  return stringFromValue(value) || "Duix job failed";
}

function progressField(payload) {
  const data = nestedPayload(payload);
  return findValueByKeys([data, payload], progressKeys, 4);
}

function completedStatus(value) {
  return value === 2 || ["completed", "complete", "success", "succeed", "succeeded", "done", "finished", "finish"].includes(value);
}

function failedStatus(value) {
  return value === -1 || value === 3 || ["failed", "failure", "error", "canceled", "cancelled"].includes(value);
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

function remoteResultExtension(remoteUrl, contentType) {
  try {
    const extension = path.extname(new URL(remoteUrl).pathname);
    if (extension) return extension;
  } catch {
    // Fall back to content-type.
  }

  const normalizedType = String(contentType || "").toLowerCase();
  if (normalizedType.includes("webm")) return ".webm";
  if (normalizedType.includes("quicktime")) return ".mov";
  if (normalizedType.includes("mpeg")) return ".mp4";
  return ".mp4";
}

async function archiveRemoteResult(remoteUrl, code) {
  const shouldArchive = process.env.DUIX_ARCHIVE_REMOTE_RESULT !== "0";
  if (!shouldArchive) return remoteUrl;

  const timeoutMs = numberEnv("DUIX_RESULT_DOWNLOAD_TIMEOUT_MS", 10 * 60 * 1000);
  const response = await fetch(remoteUrl, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Unable to download Duix result ${remoteUrl}: HTTP ${response.status}`);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const extension = remoteResultExtension(remoteUrl, response.headers.get("content-type"));
  const publicName = `${sanitizeId(code)}${extension}`;
  const publicPath = path.join(outputDir, publicName);
  await fs.writeFile(publicPath, Buffer.from(await response.arrayBuffer()));
  return `/output/digital-human/duix-adapter/${publicName}`;
}

async function copyResultToPublic(resultValue, code) {
  if (resultValue.startsWith("/output/")) return resultValue;
  if (isRemoteUrl(resultValue)) return archiveRemoteResult(resultValue, code);

  const mappedHostPath = mapContainerResultToHost(resultValue);
  const candidatePath = mappedHostPath || resultValue;
  try {
    await fs.access(candidatePath);
  } catch {
    if (process.env.DUIX_ALLOW_UNRESOLVED_RESULT === "1") return resultValue;
    throw new Error(
      `Duix result is not readable from Cutix: ${resultValue}. Configure DUIX_RESULT_HOST_DIR/DUIX_RESULT_CONTAINER_DIR if Duix returns a container path.`,
    );
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
    await writeJob(code, {
      ...job,
      lastQueryPayload: payload,
      rawResult,
      videoUrl,
      completedAt: new Date().toISOString(),
    });
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
  if (failedStatus(status)) {
    return {
      status: "failed",
      jobId: code,
      error: String(errorField(payload)),
    };
  }

  if (completedStatus(status)) {
    return {
      status: "failed",
      jobId: code,
      error: "Duix reported completion but no result video field was found",
      rawStatus: status,
    };
  }

  return {
    status: "running",
    jobId: code,
    provider: "duix-adapter",
    progress: progressField(payload),
    rawStatus: status,
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

export {
  completedStatus,
  errorField,
  failedStatus,
  isLikelyResultReference,
  progressField,
  resultField,
  statusField,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, host, () => {
    console.log(`[duix-adapter] listening at http://${host}:${port}`);
    console.log(`[duix-adapter] generate endpoint http://${host}:${port}/generate`);
    console.log(`[duix-adapter] forwarding to ${duixSubmitUrl}`);
  });
}
