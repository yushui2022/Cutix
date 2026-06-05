import { NextRequest } from "next/server";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { deflateSync } from "zlib";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScriptScene = {
  id: string;
  role: string;
  layout: string;
  copy: string;
  needsDigitalHuman: boolean;
};

type TtsClip = {
  sceneId: string;
  role: string;
  layout: string;
  copy: string;
  audioUrl: string;
  durationMs: number;
};

type ChromaKeyOptions = {
  color?: string;
  similarity?: number;
  blend?: number;
};

type NormalizedChromaKeyOptions = {
  color: string;
  similarity: number;
  blend: number;
};

type DigitalHumanRequest = {
  brand?: {
    id?: string;
    name?: string;
    digitalHuman?: {
      roleName?: string;
      avatarPath?: string;
      voiceId?: string;
      notes?: string;
    };
  };
  script?: {
    scenes: ScriptScene[];
  };
  tts?: {
    clips: TtsClip[];
  };
  clips?: TtsClip[];
  provider?: "auto" | "musetalk-cli" | "placeholder" | "http-api" | "heygen-api";
  alpha?: boolean;
  chromaKey?: ChromaKeyOptions;
  allowPlaceholder?: boolean;
};

type DigitalHumanClip = {
  sceneId: string;
  role: string;
  layout: string;
  copy: string;
  audioUrl: string;
  videoUrl: string;
  sourceVideoUrl: string;
  alphaVideoUrl?: string;
  durationMs: number;
  source: "musetalk-cli" | "ffmpeg-placeholder" | "http-api" | "heygen-api";
  alpha: boolean;
  alphaMode: "none" | "chromakey-vp9" | "provider-alpha-webm";
  alphaError?: string;
  placeholder: boolean;
};

type DigitalHumanProvider = "placeholder" | "musetalk-cli" | "http-api" | "heygen-api";

type StoredDigitalHumanConfig = {
  provider: DigitalHumanProvider;
  endpoint: string;
  avatarPath: string;
  pythonPath: string;
  apiKey?: string;
};

type BrandDigitalHumanProfile = NonNullable<DigitalHumanRequest["brand"]>["digitalHuman"];

const outputDir = path.join(process.cwd(), "public", "output", "digital-human");
const dataDir = path.join(process.cwd(), "data", "digital-human");
const digitalHumanConfigFile = path.join(process.cwd(), "data", "digital-human-config.json");

const digitalHumanLayouts = new Set(["full_dh", "dh_top_broll_bottom", "broll_top_dh_bottom"]);
const defaultChromaKey: NormalizedChromaKeyOptions = {
  color: "0x00FF00",
  similarity: 0.18,
  blend: 0.08,
};

const defaultDigitalHumanConfig: StoredDigitalHumanConfig = {
  provider: "placeholder",
  endpoint: "",
  avatarPath: "",
  pythonPath: "python",
};

function sanitizeId(value: string) {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "scene";
}

function publicUrlToPath(url: string) {
  if (!url.startsWith("/output/")) throw new Error(`Only /output URLs are supported: ${url}`);
  return path.join(process.cwd(), "public", url.replace(/^\/+/, ""));
}

function getBundledFfmpegPath() {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "@remotion", "compositor-win32-x64-msvc", exe);
}

function getStaticFfmpegPath() {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", exe);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeChromaColor(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return defaultChromaKey.color;

  const hex = raw.replace(/^#/, "").replace(/^0x/i, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return `0x${hex.toUpperCase()}`;
  return defaultChromaKey.color;
}

function normalizeChromaKey(input: ChromaKeyOptions | undefined): NormalizedChromaKeyOptions {
  return {
    color: normalizeChromaColor(input?.color),
    similarity: clampNumber(input?.similarity, defaultChromaKey.similarity, 0.01, 1),
    blend: clampNumber(input?.blend, defaultChromaKey.blend, 0, 1),
  };
}

function normalizeDigitalHumanProvider(value: unknown): DigitalHumanProvider {
  if (value === "musetalk-cli" || value === "http-api" || value === "heygen-api") return value;
  return "placeholder";
}

function normalizeDigitalHumanConfig(value: unknown): StoredDigitalHumanConfig {
  if (typeof value !== "object" || value === null) return defaultDigitalHumanConfig;
  const raw = value as Record<string, unknown>;
  return {
    provider: normalizeDigitalHumanProvider(raw.provider),
    endpoint: typeof raw.endpoint === "string" ? raw.endpoint.trim() : "",
    avatarPath: typeof raw.avatarPath === "string" ? raw.avatarPath.trim() : "",
    pythonPath: typeof raw.pythonPath === "string" && raw.pythonPath.trim() ? raw.pythonPath.trim() : "python",
    apiKey: typeof raw.apiKey === "string" && raw.apiKey ? raw.apiKey : undefined,
  };
}

async function readDigitalHumanConfig(): Promise<StoredDigitalHumanConfig> {
  try {
    const raw = await fs.readFile(digitalHumanConfigFile, "utf8");
    return normalizeDigitalHumanConfig(JSON.parse(raw));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return defaultDigitalHumanConfig;
    }
    throw error;
  }
}

async function getFfmpegCommand() {
  const configured = process.env.FFMPEG_PATH;
  if (configured) {
    try {
      await fs.access(configured);
      return configured;
    } catch {
      // Fall through to local project binaries.
    }
  }

  const staticBinary = getStaticFfmpegPath();
  try {
    await fs.access(staticBinary);
    return staticBinary;
  } catch {
    // Fall through to Remotion's bundled ffmpeg.
  }

  const bundled = getBundledFfmpegPath();
  try {
    await fs.access(bundled);
    return bundled;
  } catch {
    return "ffmpeg";
  }
}

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      timeout: 10 * 60 * 1000,
    });

    let lastOutput = "";
    const appendOutput = (chunk: Buffer) => {
      lastOutput = `${lastOutput}${chunk.toString()}`.slice(-2000);
    };

    child.stdout?.on("data", appendOutput);
    child.stderr?.on("data", appendOutput);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exit ${code}: ${lastOutput}`));
    });
  });
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPlaceholderPng() {
  const width = 540;
  const height = 480;
  const channels = 3;
  const rows: Buffer[] = [];

  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * channels);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * channels;
      const dx = x - 270;
      const headDy = y - 145;
      const inHead = dx * dx + headDy * headDy < 82 * 82;
      const inTorso = x > 175 && x < 365 && y > 245 && y < 450;
      const inEye = (Math.abs(x - 238) < 16 || Math.abs(x - 302) < 16) && Math.abs(y - 135) < 8;
      const inMouth = x > 236 && x < 304 && y > 185 && y < 196;
      let red = 0;
      let green = 255;
      let blue = 0;

      if (inTorso) {
        red = 67;
        green = 79;
        blue = 118;
      }
      if (inHead) {
        red = 118;
        green = 133;
        blue = 176;
      }
      if (inEye) {
        red = 13;
        green = 18;
        blue = 32;
      }
      if (inMouth) {
        red = 255;
        green = 59;
        blue = 92;
      }

      row[offset] = red;
      row[offset + 1] = green;
      row[offset + 2] = blue;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function createAlphaWebm(
  sourcePath: string,
  outputBaseName: string,
  chromaKey: NormalizedChromaKeyOptions,
) {
  const ffmpeg = await getFfmpegCommand();
  const outputName = `${sanitizeId(outputBaseName)}-alpha.webm`;
  const outputPath = path.join(outputDir, outputName);
  const filter = `chromakey=color=${chromaKey.color}:similarity=${chromaKey.similarity}:blend=${chromaKey.blend},format=yuva420p`;

  await runCommand(
    ffmpeg,
    [
      "-y",
      "-i",
      sourcePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-vf",
      filter,
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-auto-alt-ref",
      "0",
      "-metadata:s:v:0",
      "alpha_mode=1",
      "-deadline",
      "realtime",
      "-cpu-used",
      "6",
      "-b:v",
      "2M",
      "-c:a",
      "libopus",
      "-b:a",
      "96k",
      outputPath,
    ],
    process.cwd(),
  );

  return {
    outputPath,
    outputUrl: `/output/digital-human/${outputName}`,
  };
}

async function finalizeDigitalHumanClip({
  clip,
  source,
  placeholder,
  sourcePath,
  sourceVideoUrl,
  alphaEnabled,
  chromaKey,
}: {
  clip: TtsClip;
  source: DigitalHumanClip["source"];
  placeholder: boolean;
  sourcePath: string;
  sourceVideoUrl: string;
  alphaEnabled: boolean;
  chromaKey: NormalizedChromaKeyOptions;
}): Promise<DigitalHumanClip> {
  let videoUrl = sourceVideoUrl;
  let alphaVideoUrl: string | undefined;
  let alphaError: string | undefined;

  if (alphaEnabled) {
    try {
      const alphaResult = await createAlphaWebm(sourcePath, path.parse(sourcePath).name, chromaKey);
      videoUrl = alphaResult.outputUrl;
      alphaVideoUrl = alphaResult.outputUrl;
    } catch (error: unknown) {
      alphaError = getErrorMessage(error);
    }
  }

  return {
    sceneId: clip.sceneId,
    role: clip.role,
    layout: clip.layout,
    copy: clip.copy,
    audioUrl: clip.audioUrl,
    videoUrl,
    sourceVideoUrl,
    alphaVideoUrl,
    durationMs: clip.durationMs,
    source,
    alpha: Boolean(alphaVideoUrl),
    alphaMode: alphaVideoUrl ? "chromakey-vp9" : "none",
    alphaError,
    placeholder,
  };
}

async function createPlaceholderClip(
  clip: TtsClip,
  jobId: string,
  alphaEnabled: boolean,
  chromaKey: NormalizedChromaKeyOptions,
): Promise<DigitalHumanClip> {
  const ffmpeg = await getFfmpegCommand();
  const audioPath = publicUrlToPath(clip.audioUrl);
  await fs.access(audioPath);

  const outputName = `${jobId}-${sanitizeId(clip.sceneId)}.mp4`;
  const outputPath = path.join(outputDir, outputName);
  const imagePath = path.join(outputDir, `${jobId}-${sanitizeId(clip.sceneId)}.png`);
  await fs.writeFile(imagePath, createPlaceholderPng());

  await runCommand(
    ffmpeg,
    [
      "-y",
      "-loop",
      "1",
      "-i",
      imagePath,
      "-i",
      audioPath,
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      outputPath,
    ],
    process.cwd(),
  );

  return finalizeDigitalHumanClip({
    clip,
    source: "ffmpeg-placeholder",
    placeholder: true,
    sourcePath: outputPath,
    sourceVideoUrl: `/output/digital-human/${outputName}`,
    alphaEnabled,
    chromaKey,
  });
}

async function writeMuseTalkConfig(clip: TtsClip, jobId: string, runtimeConfig: StoredDigitalHumanConfig) {
  const avatarPath = process.env.MUSETALK_AVATAR_PATH || runtimeConfig.avatarPath;
  if (!avatarPath) throw new Error("MUSETALK_AVATAR_PATH is not configured");

  const audioPath = publicUrlToPath(clip.audioUrl);
  const configPath = path.join(dataDir, `${jobId}-${sanitizeId(clip.sceneId)}.yaml`);
  const resultName = `${jobId}-${sanitizeId(clip.sceneId)}.mp4`;
  const yaml = [
    "task_0:",
    ` video_path: "${avatarPath.replace(/\\/g, "/")}"`,
    ` audio_path: "${audioPath.replace(/\\/g, "/")}"`,
    ` result_name: "${resultName}"`,
  ].join("\n");

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configPath, yaml, "utf8");
  return { configPath, resultName };
}

async function createMuseTalkClip(
  clip: TtsClip,
  jobId: string,
  alphaEnabled: boolean,
  chromaKey: NormalizedChromaKeyOptions,
  runtimeConfig: StoredDigitalHumanConfig,
): Promise<DigitalHumanClip> {
  const root = path.resolve(process.cwd(), "..", "external", "musetalk");
  const python = process.env.MUSETALK_PYTHON || runtimeConfig.pythonPath || "python";
  const version = process.env.MUSETALK_VERSION || "v15";
  const unetModelPath = process.env.MUSETALK_UNET_MODEL_PATH || "models/musetalkV15/unet.pth";
  const unetConfig = process.env.MUSETALK_UNET_CONFIG || "models/musetalkV15/musetalk.json";
  const ffmpegPath = path.dirname(await getFfmpegCommand());
  const resultDir = path.join(process.cwd(), "public", "output", "digital-human", "musetalk-work", jobId);
  const { configPath, resultName } = await writeMuseTalkConfig(clip, jobId, runtimeConfig);

  await fs.mkdir(resultDir, { recursive: true });
  await runCommand(
    python,
    [
      "-m",
      "scripts.inference",
      "--inference_config",
      configPath,
      "--result_dir",
      resultDir,
      "--unet_model_path",
      unetModelPath,
      "--unet_config",
      unetConfig,
      "--version",
      version,
      "--ffmpeg_path",
      ffmpegPath,
    ],
    root,
  );

  const generatedPath = path.join(resultDir, version, resultName);
  await fs.access(generatedPath);
  const publicName = `${jobId}-${sanitizeId(clip.sceneId)}.mp4`;
  const publicPath = path.join(outputDir, publicName);
  await fs.copyFile(generatedPath, publicPath);

  return finalizeDigitalHumanClip({
    clip,
    source: "musetalk-cli",
    placeholder: false,
    sourcePath: publicPath,
    sourceVideoUrl: `/output/digital-human/${publicName}`,
    alphaEnabled,
    chromaKey,
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envNumber(name: string, fallback: number, min: number, max: number) {
  return clampNumber(Number(process.env[name]), fallback, min, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function nestedHttpPayload(data: Record<string, unknown>) {
  if (typeof data.result === "object" && data.result !== null) return data.result as Record<string, unknown>;
  if (typeof data.data === "object" && data.data !== null) return data.data as Record<string, unknown>;
  return data;
}

function stringField(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "string" && data[key] ? data[key] : undefined;
}

function numberField(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "number" && Number.isFinite(data[key]) ? data[key] : undefined;
}

function resolveStatusUrl(value: string | undefined, endpoint: string) {
  if (!value) return undefined;
  try {
    return new URL(value, endpoint).toString();
  } catch {
    return undefined;
  }
}

function httpPayloadToClip(clip: TtsClip, payload: Record<string, unknown>): DigitalHumanClip | null {
  const data = nestedHttpPayload(payload);
  const alphaVideoUrl = stringField(data, "alphaVideoUrl");
  const videoUrl = alphaVideoUrl || stringField(data, "videoUrl");
  if (!videoUrl) return null;

  const providerAlpha = Boolean(alphaVideoUrl || data.alpha === true);
  return {
    sceneId: clip.sceneId,
    role: clip.role,
    layout: clip.layout,
    copy: clip.copy,
    audioUrl: clip.audioUrl,
    videoUrl,
    sourceVideoUrl: stringField(data, "sourceVideoUrl") ?? videoUrl,
    alphaVideoUrl,
    durationMs: numberField(data, "durationMs") ?? clip.durationMs,
    source: "http-api",
    alpha: providerAlpha,
    alphaMode: providerAlpha ? "provider-alpha-webm" : "none",
    placeholder: false,
  };
}

async function addLocalAlphaToHttpClip(
  httpClip: DigitalHumanClip,
  alphaEnabled: boolean,
  chromaKey: NormalizedChromaKeyOptions,
): Promise<DigitalHumanClip> {
  if (!alphaEnabled || httpClip.alpha || !httpClip.videoUrl.startsWith("/output/")) return httpClip;

  try {
    const sourcePath = publicUrlToPath(httpClip.videoUrl);
    await fs.access(sourcePath);
    const alphaResult = await createAlphaWebm(sourcePath, path.parse(sourcePath).name, chromaKey);
    return {
      ...httpClip,
      videoUrl: alphaResult.outputUrl,
      alphaVideoUrl: alphaResult.outputUrl,
      alpha: true,
      alphaMode: "chromakey-vp9",
    };
  } catch (error: unknown) {
    return {
      ...httpClip,
      alphaError: getErrorMessage(error),
    };
  }
}

function statusFromPayload(payload: Record<string, unknown>) {
  const data = nestedHttpPayload(payload);
  const rawStatus = stringField(payload, "status") ?? stringField(data, "status") ?? "";
  return rawStatus.trim().toLowerCase();
}

function errorFromPayload(payload: Record<string, unknown>) {
  const data = nestedHttpPayload(payload);
  return stringField(payload, "error")
    ?? stringField(payload, "message")
    ?? stringField(data, "error")
    ?? stringField(data, "message")
    ?? "Digital human job failed";
}

async function pollHttpApiClip(
  clip: TtsClip,
  statusUrl: string,
  headers: Record<string, string>,
): Promise<DigitalHumanClip> {
  const pollIntervalMs = envNumber("DIGITAL_HUMAN_HTTP_POLL_INTERVAL_MS", 2000, 500, 30_000);
  const pollTimeoutMs = envNumber("DIGITAL_HUMAN_HTTP_POLL_TIMEOUT_MS", 10 * 60 * 1000, 10_000, 60 * 60 * 1000);
  const startedAt = Date.now();

  while (Date.now() - startedAt <= pollTimeoutMs) {
    const response = await fetch(statusUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(Math.min(30_000, pollIntervalMs + 5000)),
    });

    if (!response.ok) {
      throw new Error(`Digital human status HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = asRecord(await response.json());
    const completedClip = httpPayloadToClip(clip, payload);
    if (completedClip) return completedClip;

    const status = statusFromPayload(payload);
    if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      throw new Error(errorFromPayload(payload));
    }

    await wait(pollIntervalMs);
  }

  throw new Error(`Digital human job timed out after ${Math.round(pollTimeoutMs / 1000)}s`);
}

async function createHttpApiClip(
  clip: TtsClip,
  runtimeConfig: StoredDigitalHumanConfig,
  brand: DigitalHumanRequest["brand"],
): Promise<DigitalHumanClip> {
  if (!runtimeConfig.endpoint) throw new Error("Digital human HTTP endpoint is not configured");

  const audioPath = publicUrlToPath(clip.audioUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (runtimeConfig.apiKey) headers.Authorization = `Bearer ${runtimeConfig.apiKey}`;

  const response = await fetch(runtimeConfig.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      sceneId: clip.sceneId,
      role: clip.role,
      layout: clip.layout,
      text: clip.copy,
      audioUrl: clip.audioUrl,
      audioPath,
      durationMs: clip.durationMs,
      brandId: brand?.id,
      brandName: brand?.name,
      roleName: brand?.digitalHuman?.roleName,
      voiceId: brand?.digitalHuman?.voiceId,
      avatarPath: brand?.digitalHuman?.avatarPath || runtimeConfig.avatarPath,
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`Digital human HTTP ${response.status}: ${await response.text()}`);
  }

  const body: unknown = await response.json();
  const data = asRecord(body);
  const completedClip = httpPayloadToClip(clip, data);
  if (completedClip) return completedClip;

  const nested = nestedHttpPayload(data);
  const statusUrl = resolveStatusUrl(
    stringField(data, "statusUrl")
      ?? stringField(data, "pollUrl")
      ?? stringField(nested, "statusUrl")
      ?? stringField(nested, "pollUrl"),
    runtimeConfig.endpoint,
  );
  if (!statusUrl) {
    throw new Error("Digital human HTTP response must include videoUrl/alphaVideoUrl or statusUrl/pollUrl");
  }

  const pollHeaders: Record<string, string> = { Accept: "application/json" };
  if (runtimeConfig.apiKey) pollHeaders.Authorization = `Bearer ${runtimeConfig.apiKey}`;
  return pollHttpApiClip(clip, statusUrl, pollHeaders);
}

function heygenApiBase(runtimeConfig: StoredDigitalHumanConfig) {
  return (runtimeConfig.endpoint || process.env.HEYGEN_API_BASE_URL || "https://api.heygen.com").replace(/\/$/, "");
}

function heygenUploadBase() {
  return (process.env.HEYGEN_UPLOAD_BASE_URL || "https://upload.heygen.com").replace(/\/$/, "");
}

function heygenApiKey(runtimeConfig: StoredDigitalHumanConfig) {
  const key = runtimeConfig.apiKey || process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY or digital human API Key is not configured");
  return key;
}

function heygenStringField(payload: Record<string, unknown>, ...keys: string[]) {
  const nested = nestedHttpPayload(payload);
  for (const key of keys) {
    const value = stringField(payload, key) ?? stringField(nested, key);
    if (value) return value;
  }
  return undefined;
}

async function convertClipAudioToHeyGenMp3(clip: TtsClip, jobId: string) {
  const ffmpeg = await getFfmpegCommand();
  const audioPath = publicUrlToPath(clip.audioUrl);
  const outputName = `${jobId}-${sanitizeId(clip.sceneId)}-heygen.mp3`;
  const outputPath = path.join(outputDir, outputName);
  await fs.access(audioPath);
  await runCommand(
    ffmpeg,
    [
      "-y",
      "-i",
      audioPath,
      "-vn",
      "-ar",
      "44100",
      "-ac",
      "1",
      "-b:a",
      "128k",
      outputPath,
    ],
    process.cwd(),
  );
  return outputPath;
}

async function uploadHeyGenAudio(audioPath: string, runtimeConfig: StoredDigitalHumanConfig) {
  const response = await fetch(`${heygenUploadBase()}/v1/asset`, {
    method: "POST",
    headers: {
      "Content-Type": "audio/mpeg",
      "X-API-KEY": heygenApiKey(runtimeConfig),
    },
    body: await fs.readFile(audioPath),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`HeyGen audio upload HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = asRecord(await response.json());
  const assetId = heygenStringField(payload, "id", "asset_id", "audio_asset_id");
  if (!assetId) throw new Error(`HeyGen audio upload response missing asset id: ${JSON.stringify(payload)}`);
  return assetId;
}

async function createHeyGenWebmJob(
  clip: TtsClip,
  jobId: string,
  audioAssetId: string,
  runtimeConfig: StoredDigitalHumanConfig,
  brand: DigitalHumanRequest["brand"],
) {
  const avatarPoseId = brand?.digitalHuman?.avatarPath?.trim() || runtimeConfig.avatarPath;
  if (!avatarPoseId) throw new Error("HeyGen avatar_pose_id is not configured");

  const response = await fetch(`${heygenApiBase(runtimeConfig)}/v1/video.webm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": heygenApiKey(runtimeConfig),
    },
    body: JSON.stringify({
      avatar_pose_id: avatarPoseId,
      input_audio: audioAssetId,
      dimension: {
        width: Number(process.env.HEYGEN_WEBM_WIDTH || "540"),
        height: Number(process.env.HEYGEN_WEBM_HEIGHT || "960"),
      },
      title: `${brand?.name || "Cutix"} ${clip.sceneId} ${jobId}`,
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`HeyGen WebM job HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = asRecord(await response.json());
  const videoId = heygenStringField(payload, "video_id", "id");
  if (!videoId) throw new Error(`HeyGen WebM response missing video_id: ${JSON.stringify(payload)}`);
  return videoId;
}

async function pollHeyGenVideo(videoId: string, runtimeConfig: StoredDigitalHumanConfig) {
  const pollIntervalMs = envNumber("HEYGEN_POLL_INTERVAL_MS", 5000, 1000, 60_000);
  const pollTimeoutMs = envNumber("HEYGEN_POLL_TIMEOUT_MS", 20 * 60 * 1000, 30_000, 2 * 60 * 60 * 1000);
  const startedAt = Date.now();

  while (Date.now() - startedAt <= pollTimeoutMs) {
    const response = await fetch(
      `${heygenApiBase(runtimeConfig)}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-API-KEY": heygenApiKey(runtimeConfig),
        },
        signal: AbortSignal.timeout(Math.min(60_000, pollIntervalMs + 10_000)),
      },
    );

    if (!response.ok) {
      throw new Error(`HeyGen status HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = asRecord(await response.json());
    const videoUrl = heygenStringField(payload, "video_url", "url", "download_url");
    if (videoUrl) return videoUrl;

    const status = statusFromPayload(payload);
    if (["completed", "complete", "done", "success"].includes(status)) {
      throw new Error(`HeyGen completed without video_url: ${JSON.stringify(payload)}`);
    }
    if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      throw new Error(errorFromPayload(payload));
    }

    await wait(pollIntervalMs);
  }

  throw new Error(`HeyGen job timed out after ${Math.round(pollTimeoutMs / 1000)}s`);
}

async function downloadHeyGenVideo(remoteUrl: string, outputName: string) {
  const outputPath = path.join(outputDir, outputName);
  const response = await fetch(remoteUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`HeyGen video download HTTP ${response.status}: ${await response.text()}`);
  }

  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return {
    outputPath,
    outputUrl: `/output/digital-human/${outputName}`,
  };
}

async function createHeyGenClip(
  clip: TtsClip,
  jobId: string,
  runtimeConfig: StoredDigitalHumanConfig,
  brand: DigitalHumanRequest["brand"],
): Promise<DigitalHumanClip> {
  const audioPath = await convertClipAudioToHeyGenMp3(clip, jobId);
  const audioAssetId = await uploadHeyGenAudio(audioPath, runtimeConfig);
  const videoId = await createHeyGenWebmJob(clip, jobId, audioAssetId, runtimeConfig, brand);
  const remoteVideoUrl = await pollHeyGenVideo(videoId, runtimeConfig);
  const outputName = `${jobId}-${sanitizeId(clip.sceneId)}-heygen.webm`;
  const downloaded = await downloadHeyGenVideo(remoteVideoUrl, outputName);

  return {
    sceneId: clip.sceneId,
    role: clip.role,
    layout: clip.layout,
    copy: clip.copy,
    audioUrl: clip.audioUrl,
    videoUrl: downloaded.outputUrl,
    sourceVideoUrl: remoteVideoUrl,
    alphaVideoUrl: downloaded.outputUrl,
    durationMs: clip.durationMs,
    source: "heygen-api",
    alpha: true,
    alphaMode: "provider-alpha-webm",
    placeholder: false,
  };
}

function needsDigitalHuman(scene: ScriptScene | undefined, clip: TtsClip) {
  if (scene?.needsDigitalHuman) return true;
  return digitalHumanLayouts.has(scene?.layout ?? clip.layout);
}

function applyBrandDigitalHumanProfile(
  runtimeConfig: StoredDigitalHumanConfig,
  profile: BrandDigitalHumanProfile,
): StoredDigitalHumanConfig {
  return {
    ...runtimeConfig,
    avatarPath: profile?.avatarPath?.trim() || runtimeConfig.avatarPath,
  };
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const data = typeof body === "object" && body !== null ? body as DigitalHumanRequest : {};
  const clips = Array.isArray(data.clips) ? data.clips : data.tts?.clips;

  if (!Array.isArray(clips) || clips.length === 0) {
    return Response.json({ error: "tts.clips or clips is required" }, { status: 400 });
  }

  await fs.mkdir(outputDir, { recursive: true });

  const scenesById = new Map((data.script?.scenes ?? []).map((scene) => [scene.id, scene]));
  const jobId = `dh_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const requestedProvider = data.provider ?? "auto";
  const runtimeConfig = await readDigitalHumanConfig();
  const effectiveRuntimeConfig = applyBrandDigitalHumanProfile(runtimeConfig, data.brand?.digitalHuman);
  const autoProvider: DigitalHumanProvider = process.env.MUSETALK_ENABLE === "1" ? "musetalk-cli" : runtimeConfig.provider;
  const effectiveProvider = requestedProvider === "auto" ? autoProvider : requestedProvider;
  const alphaEnabled = data.alpha !== false;
  const chromaKey = normalizeChromaKey(data.chromaKey);
  const targetClips = clips.filter((clip) => needsDigitalHuman(scenesById.get(clip.sceneId), clip));
  const generated: DigitalHumanClip[] = [];
  const errors: Array<{ sceneId: string; message: string }> = [];

  if (targetClips.length > 0 && effectiveProvider === "placeholder" && data.allowPlaceholder !== true) {
    return Response.json(
      {
        error: "Production digital human provider is not configured. Placeholder generation is disabled for delivery.",
        provider: "placeholder",
        productionReady: false,
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const addGeneratedClip = (clip: DigitalHumanClip) => {
    generated.push(clip);
    if (clip.alphaError) {
      errors.push({
        sceneId: clip.sceneId,
        message: `Alpha channel failed: ${clip.alphaError}`,
      });
    }
  };

  for (const clip of targetClips) {
    try {
      if (effectiveProvider === "musetalk-cli") {
        addGeneratedClip(await createMuseTalkClip(clip, jobId, alphaEnabled, chromaKey, effectiveRuntimeConfig));
      } else if (effectiveProvider === "http-api") {
        addGeneratedClip(
          await addLocalAlphaToHttpClip(
            await createHttpApiClip(clip, effectiveRuntimeConfig, data.brand),
            alphaEnabled,
            chromaKey,
          ),
        );
      } else if (effectiveProvider === "heygen-api") {
        addGeneratedClip(await createHeyGenClip(clip, jobId, effectiveRuntimeConfig, data.brand));
      } else {
        addGeneratedClip(await createPlaceholderClip(clip, jobId, alphaEnabled, chromaKey));
      }
    } catch (error: unknown) {
      if (requestedProvider !== "auto" || data.allowPlaceholder !== true) throw error;
      errors.push({
        sceneId: clip.sceneId,
        message: getErrorMessage(error),
      });
      addGeneratedClip(await createPlaceholderClip(clip, jobId, alphaEnabled, chromaKey));
    }
  }

  return Response.json(
    {
      jobId,
      provider: generated.some((clip) => clip.source === "musetalk-cli")
        ? "musetalk-cli"
        : generated.some((clip) => clip.source === "http-api")
          ? "http-api"
          : generated.some((clip) => clip.source === "heygen-api")
            ? "heygen-api"
            : "ffmpeg-placeholder",
      alpha: generated.length > 0 && generated.every((clip) => clip.alpha),
      productionReady: generated.every((clip) => !clip.placeholder && clip.source !== "heygen-api"),
      chromaKey: alphaEnabled ? chromaKey : null,
      clips: generated,
      errors,
      totalDurationMs: generated.reduce((sum, clip) => sum + clip.durationMs, 0),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
