import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const platformRoot = process.cwd();
const outputDir = path.join(platformRoot, "public", "output", "digital-human");
const serviceDataDir = path.join(platformRoot, "data", "digital-human", "musetalk-service");
const defaultMuseTalkRoot = path.resolve(platformRoot, "..", "external", "musetalk");

const port = Number(process.env.MUSETALK_SERVICE_PORT || process.env.PORT || "8788");
const host = process.env.MUSETALK_SERVICE_HOST || "127.0.0.1";

function sanitizeId(value) {
  return String(value || "scene")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "scene";
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

function getFfmpegCommand() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(platformRoot, "node_modules", "ffmpeg-static", exe);
}

function runCommand(command, args, cwd, timeoutMs = 30 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      timeout: timeoutMs,
    });

    let lastOutput = "";
    const appendOutput = (chunk) => {
      lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
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

function audioPathFromPayload(payload) {
  if (typeof payload.audioPath === "string" && payload.audioPath.trim()) return payload.audioPath.trim();
  if (typeof payload.audioUrl === "string" && payload.audioUrl.startsWith("/output/")) {
    return path.join(platformRoot, "public", payload.audioUrl.replace(/^\/+/, ""));
  }
  throw new Error("audioPath or /output audioUrl is required");
}

function avatarPathFromPayload(payload) {
  const value = typeof payload.avatarPath === "string" ? payload.avatarPath.trim() : "";
  const fallback = process.env.MUSETALK_AVATAR_PATH || "";
  if (value) return value;
  if (fallback) return fallback;
  throw new Error("avatarPath or MUSETALK_AVATAR_PATH is required");
}

async function writeMuseTalkConfig(payload, jobId, audioPath, avatarPath) {
  const sceneId = sanitizeId(payload.sceneId);
  const resultName = `${jobId}-${sceneId}.mp4`;
  const configPath = path.join(serviceDataDir, `${jobId}-${sceneId}.yaml`);
  const yaml = [
    "task_0:",
    ` video_path: "${avatarPath.replace(/\\/g, "/")}"`,
    ` audio_path: "${audioPath.replace(/\\/g, "/")}"`,
    ` result_name: "${resultName}"`,
  ].join("\n");

  await fs.mkdir(serviceDataDir, { recursive: true });
  await fs.writeFile(configPath, yaml, "utf8");
  return { configPath, resultName };
}

async function findGeneratedVideo(resultDir, version, resultName) {
  const candidates = [
    path.join(resultDir, version, resultName),
    path.join(resultDir, resultName),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue.
    }
  }
  throw new Error(`MuseTalk output not found: ${candidates.join(" or ")}`);
}

async function createAlphaWebm(sourcePath, outputBaseName, chromaKey) {
  const ffmpeg = getFfmpegCommand();
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
    platformRoot,
    10 * 60 * 1000,
  );

  return `/output/digital-human/${outputName}`;
}

function normalizedChromaKey(payload) {
  const chroma = typeof payload.chromaKey === "object" && payload.chromaKey !== null ? payload.chromaKey : {};
  const rawColor = typeof chroma.color === "string" ? chroma.color : process.env.MUSETALK_CHROMA_COLOR || "0x00FF00";
  const color = rawColor.startsWith("#") ? `0x${rawColor.slice(1)}` : rawColor;
  return {
    color,
    similarity: Number(chroma.similarity ?? process.env.MUSETALK_CHROMA_SIMILARITY ?? "0.18"),
    blend: Number(chroma.blend ?? process.env.MUSETALK_CHROMA_BLEND ?? "0.08"),
  };
}

async function generateMuseTalkClip(payload) {
  const museTalkRoot = path.resolve(process.env.MUSETALK_ROOT || defaultMuseTalkRoot);
  const python = process.env.MUSETALK_PYTHON || "python";
  const version = process.env.MUSETALK_VERSION || "v15";
  const unetModelPath = process.env.MUSETALK_UNET_MODEL_PATH || "models/musetalkV15/unet.pth";
  const unetConfig = process.env.MUSETALK_UNET_CONFIG || "models/musetalkV15/musetalk.json";
  const ffmpegPath = path.dirname(getFfmpegCommand());
  const sceneId = sanitizeId(payload.sceneId);
  const jobId = `dh_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const audioPath = audioPathFromPayload(payload);
  const avatarPath = avatarPathFromPayload(payload);

  await fs.access(museTalkRoot);
  await fs.access(audioPath);
  await fs.access(avatarPath);
  await fs.mkdir(outputDir, { recursive: true });

  const resultDir = path.join(outputDir, "musetalk-service-work", jobId);
  const { configPath, resultName } = await writeMuseTalkConfig(payload, jobId, audioPath, avatarPath);
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
    museTalkRoot,
  );

  const generatedPath = await findGeneratedVideo(resultDir, version, resultName);
  const publicName = `${jobId}-${sceneId}.mp4`;
  const publicPath = path.join(outputDir, publicName);
  await fs.copyFile(generatedPath, publicPath);

  const videoUrl = `/output/digital-human/${publicName}`;
  let alphaVideoUrl;
  let alphaError;
  if (payload.alpha !== false) {
    try {
      alphaVideoUrl = await createAlphaWebm(publicPath, `${jobId}-${sceneId}`, normalizedChromaKey(payload));
    } catch (error) {
      alphaError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    status: "completed",
    jobId,
    sceneId: payload.sceneId,
    provider: "musetalk-local-http",
    videoUrl,
    sourceVideoUrl: videoUrl,
    alphaVideoUrl,
    alpha: Boolean(alphaVideoUrl),
    alphaError,
    durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
  };
}

async function healthPayload() {
  const museTalkRoot = path.resolve(process.env.MUSETALK_ROOT || defaultMuseTalkRoot);
  const checks = [];
  for (const [key, target] of [
    ["platformRoot", platformRoot],
    ["musetalkRoot", museTalkRoot],
    ["outputDir", outputDir],
  ]) {
    try {
      await fs.access(target);
      checks.push({ key, status: "pass", target });
    } catch {
      checks.push({ key, status: "fail", target });
    }
  }
  return {
    service: "cutix-musetalk-http-service",
    ok: checks.every((check) => check.status === "pass"),
    endpoint: `http://${host}:${port}/generate`,
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
      const result = await generateMuseTalkClip(payload);
      jsonResponse(response, 200, result);
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
  console.log(`[musetalk-service] listening at http://${host}:${port}`);
  console.log(`[musetalk-service] generate endpoint http://${host}:${port}/generate`);
});
