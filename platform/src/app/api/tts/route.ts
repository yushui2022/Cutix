import { NextRequest } from "next/server";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScriptScene = {
  id: string;
  role: string;
  layout: string;
  durationSec: number;
  copy: string;
  needsDigitalHuman: boolean;
};

type GeneratedScript = {
  title: string;
  platform: string;
  scenes: ScriptScene[];
  cta: string;
};

type TtsProvider = "auto" | "cosyvoice" | "windows-sapi";

type TtsRequest = {
  script?: GeneratedScript;
  scenes?: ScriptScene[];
  provider?: TtsProvider;
  voiceId?: string;
  speed?: number;
};

type WordTiming = {
  text: string;
  startMs: number;
  endMs: number;
};

const outputDir = path.join(process.cwd(), "public", "output", "tts");

function sanitizeId(value: string) {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "scene";
}

function splitWords(text: string) {
  const cleaned = text.replace(/\s+/g, "");
  const words: string[] = [];
  let index = 0;

  while (index < cleaned.length) {
    const char = cleaned[index];
    if (/[\p{P}\p{S}]/u.test(char)) {
      words.push(char);
      index += 1;
      continue;
    }

    const size = /[a-z0-9]/i.test(char) ? 6 : 3;
    words.push(cleaned.slice(index, Math.min(index + size, cleaned.length)));
    index += size;
  }

  return words.filter(Boolean);
}

function buildWordTimings(text: string, durationMs: number): WordTiming[] {
  const words = splitWords(text);
  const totalWeight = words.reduce((sum, word) => sum + Math.max(1, word.length), 0) || 1;
  let cursor = 0;

  return words.map((word) => {
    const weight = Math.max(1, word.length);
    const startMs = cursor;
    const wordDuration = Math.max(120, Math.round((durationMs * weight) / totalWeight));
    cursor = Math.min(durationMs, cursor + wordDuration);
    return {
      text: word,
      startMs,
      endMs: cursor,
    };
  });
}

function wavHeader(dataLength: number, sampleRate = 22050, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

async function writePcmAsWav(filePath: string, pcm: Buffer, sampleRate = 22050) {
  await fs.writeFile(filePath, Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]));
}

function readWavDurationMs(buffer: Buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return 0;
  }

  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") byteRate = buffer.readUInt32LE(offset + 16);
    if (chunkId === "data") dataSize = chunkSize;
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return byteRate && dataSize ? Math.round((dataSize / byteRate) * 1000) : 0;
}

function runPowerShellTts(text: string, outputPath: string, speed: number) {
  return new Promise<void>((resolve, reject) => {
    const rate = Math.max(-5, Math.min(5, Math.round((speed - 1) * 4)));
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        [
          "Add-Type -AssemblyName System.Speech",
          "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
          "$synth.Rate = [int]$env:CUTIX_TTS_RATE",
          "$synth.Volume = 100",
          "$synth.SetOutputToWaveFile($env:CUTIX_TTS_OUTPUT)",
          "$synth.Speak($env:CUTIX_TTS_TEXT)",
          "$synth.Dispose()",
        ].join("; "),
      ],
      {
        env: {
          ...process.env,
          CUTIX_TTS_OUTPUT: outputPath,
          CUTIX_TTS_TEXT: text,
          CUTIX_TTS_RATE: String(rate),
        },
        windowsHide: true,
      },
    );

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-1200);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Windows SAPI TTS failed with code ${code}: ${stderr}`));
    });
  });
}

async function synthesizeWithCosyVoice(text: string, outputPath: string, voiceId: string) {
  const baseUrl = process.env.COSYVOICE_FASTAPI_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("COSYVOICE_FASTAPI_URL is not configured");

  const form = new FormData();
  form.set("tts_text", text);
  form.set("spk_id", voiceId || "中文女");

  const response = await fetch(`${baseUrl}/inference_sft`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) throw new Error(`CosyVoice HTTP ${response.status}: ${await response.text()}`);
  const pcm = Buffer.from(await response.arrayBuffer());
  if (pcm.length === 0) throw new Error("CosyVoice returned empty audio");
  await writePcmAsWav(outputPath, pcm, 22050);
}

async function synthesizeScene(
  scene: ScriptScene,
  jobId: string,
  provider: TtsProvider,
  voiceId: string,
  speed: number,
) {
  const fileName = `${jobId}-${sanitizeId(scene.id)}.wav`;
  const outputPath = path.join(outputDir, fileName);
  const text = scene.copy.trim();
  let source: "cosyvoice-fastapi" | "windows-sapi" = "windows-sapi";
  let fallbackReason = "";

  if (provider === "cosyvoice" || (provider === "auto" && process.env.COSYVOICE_FASTAPI_URL)) {
    try {
      await synthesizeWithCosyVoice(text, outputPath, voiceId);
      source = "cosyvoice-fastapi";
    } catch (error: unknown) {
      if (provider === "cosyvoice") throw error;
      fallbackReason = error instanceof Error ? error.message : "CosyVoice failed";
      await runPowerShellTts(text, outputPath, speed);
    }
  } else {
    await runPowerShellTts(text, outputPath, speed);
  }

  const wav = await fs.readFile(outputPath);
  const durationMs = readWavDurationMs(wav) || Math.max(1200, text.length * 180);

  return {
    sceneId: scene.id,
    role: scene.role,
    layout: scene.layout,
    copy: text,
    audioUrl: `/output/tts/${fileName}`,
    durationMs,
    source,
    fallbackReason,
    words: buildWordTimings(text, durationMs),
  };
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const data = typeof body === "object" && body !== null ? body as TtsRequest : {};
  const scenes = Array.isArray(data.scenes) ? data.scenes : data.script?.scenes;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return Response.json({ error: "script.scenes or scenes is required" }, { status: 400 });
  }

  await fs.mkdir(outputDir, { recursive: true });

  const jobId = `tts_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const provider = data.provider ?? "auto";
  const voiceId = data.voiceId ?? "中文女";
  const speed = typeof data.speed === "number" ? data.speed : 1;
  const speakableScenes = scenes.filter((scene) => scene.copy?.trim());
  const clips = [];

  for (const scene of speakableScenes) {
    clips.push(await synthesizeScene(scene, jobId, provider, voiceId, speed));
  }

  const totalDurationMs = clips.reduce((sum, clip) => sum + clip.durationMs, 0);

  return Response.json(
    {
      jobId,
      provider: clips.some((clip) => clip.source === "cosyvoice-fastapi") ? "cosyvoice-fastapi" : "windows-sapi",
      voiceId,
      clips,
      totalDurationMs,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
