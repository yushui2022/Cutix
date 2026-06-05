#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const platformRoot = process.cwd();
const configFile = path.join(platformRoot, "data", "digital-human-config.json");
const reportDir = path.join(platformRoot, "data", "digital-human", "benchmarks");

function usage() {
  return `
Cutix local digital-human benchmark

Usage:
  npm run digital-human:benchmark -- --endpoint http://127.0.0.1:8789/generate --audio C:\\path\\speech.wav --avatar C:\\path\\avatar.mp4 --count 20

Options:
  --endpoint <url>          Override saved HTTP provider endpoint.
  --api-key <key>           Override saved provider API key.
  --audio <path>            Required local audio path for every scene.
  --audio-url <url>         Optional provider-visible audio URL.
  --avatar <path>           Optional local avatar/reference video path.
  --text <text>             Spoken text metadata sent to provider.
  --count <n>               Number of scenes. Default: 3.
  --duration-ms <n>         Expected scene duration. Default: 5000.
  --timeout-ms <n>          Submit request timeout. Default: 60000.
  --poll-timeout-ms <n>     Async job polling timeout. Default: 600000.
  --poll-interval-ms <n>    Async polling interval. Default: 2000.
  --out <path>              JSON report path.
  --allow-unhealthy         Continue when /health reports ok=false.
  --help                    Show this help.
`.trim();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const eqIndex = token.indexOf("=");
    if (eqIndex > -1) {
      args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function textArg(args, key, fallback = "") {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function intArg(args, key, fallback, min = 1) {
  const value = Number(args[key] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

function boolArg(args, key) {
  return args[key] === true || args[key] === "true" || args[key] === "1";
}

async function readConfig() {
  try {
    const parsed = JSON.parse(await fs.readFile(configFile, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function readableFile(value, label, required) {
  if (!value) {
    if (required) throw new Error(`${label} is required`);
    return "";
  }
  const resolved = path.resolve(value);
  await fs.access(resolved);
  return resolved;
}

function requireEndpoint(value) {
  if (!value) throw new Error("No digital human endpoint configured. Pass --endpoint or save one in system settings.");
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`Invalid endpoint URL: ${value}`);
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function healthUrlCandidates(endpoint) {
  const url = new URL(endpoint);
  const cleanPath = url.pathname.replace(/\/+$/, "");
  const candidates = [];

  if (cleanPath.endsWith("/generate")) {
    const healthUrl = new URL(url);
    healthUrl.pathname = `${cleanPath.slice(0, -"/generate".length) || ""}/health`;
    healthUrl.search = "";
    candidates.push(healthUrl.toString());
  }

  if (cleanPath && cleanPath !== "/") {
    const scopedHealthUrl = new URL(url);
    scopedHealthUrl.pathname = `${cleanPath.split("/").slice(0, -1).join("/") || ""}/health`;
    scopedHealthUrl.search = "";
    candidates.push(scopedHealthUrl.toString());
  }

  const rootHealthUrl = new URL(url);
  rootHealthUrl.pathname = "/health";
  rootHealthUrl.search = "";
  candidates.push(rootHealthUrl.toString());

  return unique(candidates);
}

async function readJson(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchJson(url, init, timeoutMs) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const payload = await readJson(response);
  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error : JSON.stringify(payload);
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return payload;
}

async function checkHealth(endpoint, authHeaders) {
  const attempts = [];
  for (const url of healthUrlCandidates(endpoint)) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...authHeaders },
        signal: AbortSignal.timeout(5000),
      });
      const payload = await readJson(response);
      attempts.push({ url, status: response.status, ok: response.ok, payload });

      if (response.status === 404 || response.status === 405) continue;
      if (!response.ok) return { status: "fail", message: `health returned HTTP ${response.status}`, attempts };
      if (typeof payload.ok === "boolean") {
        return {
          status: payload.ok ? "pass" : "fail",
          message: payload.ok ? "provider health ok" : "provider health reported not ready",
          attempts,
          payload,
        };
      }
      return { status: "warn", message: "health responded without standard ok field", attempts, payload };
    } catch (error) {
      attempts.push({ url, status: 0, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { status: "warn", message: "no standard health endpoint responded", attempts };
}

function failedPayload(payload) {
  const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
  return ["failed", "error", "canceled", "cancelled"].includes(status);
}

function readyPayload(payload) {
  const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
  return Boolean(payload.videoUrl || payload.alphaVideoUrl || payload.sourceVideoUrl || status === "completed");
}

function pollUrl(payload, endpoint) {
  const raw = typeof payload.statusUrl === "string" && payload.statusUrl
    ? payload.statusUrl
    : typeof payload.pollUrl === "string" && payload.pollUrl
      ? payload.pollUrl
      : "";
  return raw ? new URL(raw, endpoint).toString() : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForResult(initialPayload, options) {
  if (failedPayload(initialPayload)) throw new Error(initialPayload.error || "provider job failed");
  if (readyPayload(initialPayload)) return initialPayload;

  const url = pollUrl(initialPayload, options.endpoint);
  if (!url) throw new Error(`provider returned no videoUrl/alphaVideoUrl/statusUrl: ${JSON.stringify(initialPayload)}`);

  const startedAt = Date.now();
  while (Date.now() - startedAt < options.pollTimeoutMs) {
    await sleep(options.pollIntervalMs);
    const payload = await fetchJson(
      url,
      { method: "GET", headers: options.headers },
      Math.min(options.timeoutMs, options.pollIntervalMs + 10_000),
    );
    if (failedPayload(payload)) throw new Error(payload.error || "provider job failed");
    if (readyPayload(payload)) return payload;
  }
  throw new Error(`poll timeout after ${options.pollTimeoutMs}ms: ${url}`);
}

function bestOutputUrl(payload) {
  return payload.alphaVideoUrl || payload.videoUrl || payload.sourceVideoUrl || "";
}

function localOutputPath(outputUrl) {
  if (!outputUrl) return "";
  if (/^[a-z]:[\\/]/i.test(outputUrl) || outputUrl.startsWith("\\\\")) return outputUrl;
  if (outputUrl.startsWith("/output/") || outputUrl.startsWith("/uploads/")) {
    return path.join(platformRoot, "public", outputUrl.replace(/^\/+/, ""));
  }
  try {
    const url = new URL(outputUrl);
    if ((url.hostname === "127.0.0.1" || url.hostname === "localhost") && (url.pathname.startsWith("/output/") || url.pathname.startsWith("/uploads/"))) {
      return path.join(platformRoot, "public", url.pathname.replace(/^\/+/, ""));
    }
  } catch {
    return "";
  }
  return "";
}

async function fileInfo(outputUrl) {
  const localPath = localOutputPath(outputUrl);
  if (!localPath) return { localPath: "", exists: false, bytes: 0 };
  try {
    const stats = await fs.stat(localPath);
    return { localPath, exists: true, bytes: stats.size };
  } catch {
    return { localPath, exists: false, bytes: 0 };
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function payloadForScene(index, options) {
  return {
    sceneId: `dh-benchmark-${options.runId}-${String(index + 1).padStart(3, "0")}`,
    role: "benchmark",
    layout: "full_dh",
    text: `${options.text} ${index + 1}/${options.count}`,
    audioUrl: options.audioUrl,
    audioPath: options.audioPath,
    durationMs: options.durationMs,
    brandId: options.brandId,
    brandName: options.brandName,
    roleName: options.roleName,
    voiceId: options.voiceId,
    avatarPath: options.avatarPath,
  };
}

async function runScene(index, options) {
  const payload = payloadForScene(index, options);
  const startedAt = Date.now();
  try {
    const initial = await fetchJson(
      options.endpoint,
      { method: "POST", headers: options.headers, body: JSON.stringify(payload) },
      options.timeoutMs,
    );
    const result = await waitForResult(initial, options);
    const outputUrl = bestOutputUrl(result);
    return {
      sceneId: payload.sceneId,
      status: "passed",
      elapsedMs: Date.now() - startedAt,
      outputUrl,
      file: await fileInfo(outputUrl),
      result,
    };
  } catch (error) {
    return {
      sceneId: payload.sceneId,
      status: "failed",
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (boolArg(args, "help")) {
    console.log(usage());
    return;
  }

  const config = await readConfig();
  const endpoint = requireEndpoint(textArg(args, "endpoint", process.env.DIGITAL_HUMAN_BENCH_ENDPOINT || config.endpoint || ""));
  const apiKey = textArg(args, "api-key", process.env.DIGITAL_HUMAN_BENCH_API_KEY || config.apiKey || "");
  const audioPath = await readableFile(textArg(args, "audio", process.env.DIGITAL_HUMAN_BENCH_AUDIO || ""), "audio", true);
  const avatarPath = await readableFile(textArg(args, "avatar", process.env.DIGITAL_HUMAN_BENCH_AVATAR || config.avatarPath || ""), "avatar", false);

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const headers = { "content-type": "application/json", Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const options = {
    endpoint,
    headers,
    runId,
    count: intArg(args, "count", 3, 1),
    durationMs: intArg(args, "duration-ms", 5000, 100),
    timeoutMs: intArg(args, "timeout-ms", 60_000, 1000),
    pollTimeoutMs: intArg(args, "poll-timeout-ms", 600_000, 1000),
    pollIntervalMs: intArg(args, "poll-interval-ms", 2000, 200),
    audioPath,
    audioUrl: textArg(args, "audio-url", process.env.DIGITAL_HUMAN_BENCH_AUDIO_URL || ""),
    avatarPath,
    text: textArg(args, "text", "Cutix 本地数字人连续生成验收测试。"),
    brandId: textArg(args, "brand-id", "benchmark"),
    brandName: textArg(args, "brand-name", "Cutix Benchmark"),
    roleName: textArg(args, "role-name", "Cutix 本地数字人验收角色"),
    voiceId: textArg(args, "voice-id", "benchmark"),
  };

  const health = await checkHealth(endpoint, apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
  if (health.status === "fail" && !boolArg(args, "allow-unhealthy")) {
    throw new Error(`digital human health failed: ${health.message}; pass --allow-unhealthy to continue`);
  }

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Health: ${health.status} (${health.message})`);
  console.log(`Audio: ${audioPath}`);
  console.log(`Avatar: ${avatarPath || "(service default)"}`);
  console.log(`Scenes: ${options.count}`);

  const results = [];
  for (let index = 0; index < options.count; index += 1) {
    const result = await runScene(index, options);
    results.push(result);
    const tail = result.status === "passed" ? result.outputUrl || "(no output url)" : result.error;
    console.log(`${index + 1}/${options.count} ${result.sceneId} ${result.status} ${result.elapsedMs}ms ${tail}`);
  }

  const passed = results.filter((item) => item.status === "passed");
  const failed = results.filter((item) => item.status !== "passed");
  const elapsed = passed.map((item) => item.elapsedMs);
  const summary = {
    count: options.count,
    passed: passed.length,
    failed: failed.length,
    successRate: options.count > 0 ? passed.length / options.count : 0,
    averageElapsedMs: elapsed.length ? Math.round(elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length) : 0,
    p95ElapsedMs: percentile(elapsed, 95),
    maxElapsedMs: elapsed.length ? Math.max(...elapsed) : 0,
    totalOutputBytes: passed.reduce((sum, item) => sum + (item.file?.bytes || 0), 0),
  };

  const report = {
    schemaVersion: "cutix.digital_human_benchmark.v1",
    createdAt: new Date().toISOString(),
    endpoint,
    provider: config.provider || "unknown",
    health,
    request: {
      count: options.count,
      durationMs: options.durationMs,
      audioPath: options.audioPath,
      audioUrl: options.audioUrl,
      avatarPath: options.avatarPath,
      brandId: options.brandId,
      brandName: options.brandName,
      roleName: options.roleName,
      voiceId: options.voiceId,
    },
    summary,
    results,
  };

  const outPath = path.resolve(textArg(args, "out", path.join(reportDir, `benchmark-${runId}.json`)));
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Report: ${outPath}`);
  console.log(`Summary: ${summary.passed}/${summary.count} passed, avg ${summary.averageElapsedMs}ms, p95 ${summary.p95ElapsedMs}ms`);

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
