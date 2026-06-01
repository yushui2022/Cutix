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
  script?: {
    scenes: ScriptScene[];
  };
  tts?: {
    clips: TtsClip[];
  };
  clips?: TtsClip[];
  provider?: "auto" | "musetalk-cli" | "placeholder";
  alpha?: boolean;
  chromaKey?: ChromaKeyOptions;
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
  source: "musetalk-cli" | "ffmpeg-placeholder";
  alpha: boolean;
  alphaMode: "none" | "chromakey-vp9";
  alphaError?: string;
  placeholder: boolean;
};

const outputDir = path.join(process.cwd(), "public", "output", "digital-human");
const dataDir = path.join(process.cwd(), "data", "digital-human");

const digitalHumanLayouts = new Set(["full_dh", "dh_top_broll_bottom", "broll_top_dh_bottom"]);
const defaultChromaKey: NormalizedChromaKeyOptions = {
  color: "0x00FF00",
  similarity: 0.18,
  blend: 0.08,
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

async function writeMuseTalkConfig(clip: TtsClip, jobId: string) {
  const avatarPath = process.env.MUSETALK_AVATAR_PATH;
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
): Promise<DigitalHumanClip> {
  const root = path.resolve(process.cwd(), "..", "external", "musetalk");
  const python = process.env.MUSETALK_PYTHON || "python";
  const version = process.env.MUSETALK_VERSION || "v15";
  const unetModelPath = process.env.MUSETALK_UNET_MODEL_PATH || "models/musetalkV15/unet.pth";
  const unetConfig = process.env.MUSETALK_UNET_CONFIG || "models/musetalkV15/musetalk.json";
  const ffmpegPath = path.dirname(await getFfmpegCommand());
  const resultDir = path.join(process.cwd(), "public", "output", "digital-human", "musetalk-work", jobId);
  const { configPath, resultName } = await writeMuseTalkConfig(clip, jobId);

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

function needsDigitalHuman(scene: ScriptScene | undefined, clip: TtsClip) {
  if (scene?.needsDigitalHuman) return true;
  return digitalHumanLayouts.has(scene?.layout ?? clip.layout);
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
  const alphaEnabled = data.alpha !== false;
  const chromaKey = normalizeChromaKey(data.chromaKey);
  const targetClips = clips.filter((clip) => needsDigitalHuman(scenesById.get(clip.sceneId), clip));
  const generated: DigitalHumanClip[] = [];
  const errors: Array<{ sceneId: string; message: string }> = [];

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
      if (
        requestedProvider === "musetalk-cli"
        || (requestedProvider === "auto" && process.env.MUSETALK_ENABLE === "1")
      ) {
        addGeneratedClip(await createMuseTalkClip(clip, jobId, alphaEnabled, chromaKey));
      } else {
        addGeneratedClip(await createPlaceholderClip(clip, jobId, alphaEnabled, chromaKey));
      }
    } catch (error: unknown) {
      if (requestedProvider === "musetalk-cli") throw error;
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
      provider: generated.some((clip) => clip.source === "musetalk-cli") ? "musetalk-cli" : "ffmpeg-placeholder",
      alpha: generated.length > 0 && generated.every((clip) => clip.alpha),
      chromaKey: alphaEnabled ? chromaKey : null,
      clips: generated,
      errors,
      totalDurationMs: generated.reduce((sum, clip) => sum + clip.durationMs, 0),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
