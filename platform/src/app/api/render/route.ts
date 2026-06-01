import { NextRequest } from "next/server";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import { spawn } from "child_process";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import os from "os";
import { createRenderTask, updateRenderTask } from "@/lib/render-task-store";

type SceneLayout = "full_dh" | "dh_top_broll_bottom" | "broll_top_dh_bottom" | "full_broll";

type BrandInput = {
  id?: string;
  name?: string;
  color?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoText?: string;
};

type ScriptScene = {
  id: string;
  role: string;
  layout: string;
  durationSec: number;
  copy: string;
  needsDigitalHuman?: boolean;
};

type VideoPlanScene = {
  id: string;
  visualGoal?: string;
  transition?: "cut" | "fade" | "slide" | "zoom" | string;
  digitalHuman?: {
    text?: string;
  };
};

type GeneratedScript = {
  title?: string;
  platform?: string;
  scenes: ScriptScene[];
  cta?: string;
  videoPlan?: {
    id?: string;
    scenes?: VideoPlanScene[];
  };
};

type SelectionAsset = {
  id: string;
  name: string;
  type: "video" | "image" | "audio" | "avatar";
  url?: string;
};

type SlotSelection = {
  slot: string;
  primaryAsset: SelectionAsset | null;
};

type SceneSelectionPreview = {
  sceneId: string;
  slots: SlotSelection[];
};

type AssetSelectionPreview = {
  selections: SceneSelectionPreview[];
  global?: {
    bgm?: SelectionAsset | null;
  };
};

type TtsWord = {
  text: string;
  startMs: number;
  endMs: number;
};

type TtsClip = {
  sceneId: string;
  audioUrl: string;
  durationMs: number;
  words: TtsWord[];
};

type TtsPreview = {
  clips: TtsClip[];
};

type DigitalHumanClip = {
  sceneId: string;
  videoUrl: string;
  alphaVideoUrl?: string;
  durationMs: number;
  alpha?: boolean;
};

type DigitalHumanPreview = {
  clips: DigitalHumanClip[];
};

type TimelineScene = {
  id: string;
  role: string;
  layout: SceneLayout;
  startSec: number;
  durationSec: number;
  digitalHumanVideo?: string;
  brollVideo?: string;
  brollImages?: string[];
  audioUrl?: string;
  subtitleWords: TtsWord[];
  overlayText?: string;
  transition?: string;
};

type RenderProps = {
  brand: {
    name: string;
    primaryColor: string;
    secondaryColor: string;
    logoText: string;
  };
  scenes: TimelineScene[];
  bgmUrl?: string;
};

type RenderRequest = {
  ipId?: string;
  brand?: BrandInput;
  template?: {
    id?: string;
    name?: string;
  };
  script?: GeneratedScript;
  selection?: AssetSelectionPreview | null;
  tts?: TtsPreview | null;
  digitalHuman?: DigitalHumanPreview | null;
};

const ipConfigs: Record<string, RenderProps["brand"]> = {
  wang: { name: "老王餐饮", primaryColor: "#E7333F", secondaryColor: "#1A1A2E", logoText: "老王餐饮" },
  li: { name: "李总商业", primaryColor: "#3B82F6", secondaryColor: "#0F172A", logoText: "李总商业" },
  zhang: { name: "张姐美妆", primaryColor: "#EC4899", secondaryColor: "#1C0F1A", logoText: "张姐美妆" },
};

let remotionServeUrl: Promise<string> | null = null;

function subtitleWords(text: string, durationMs: number) {
  const cleaned = text.replace(/\s+/g, "");
  const pieces: string[] = [];
  let index = 0;

  while (index < cleaned.length) {
    const char = cleaned[index];
    if (/[\p{P}\p{S}]/u.test(char)) {
      pieces.push(char);
      index += 1;
    } else {
      const size = /[a-z0-9]/i.test(char) ? 6 : 3;
      pieces.push(cleaned.slice(index, Math.min(index + size, cleaned.length)));
      index += size;
    }
  }

  const totalWeight = pieces.reduce((sum, word) => sum + Math.max(1, word.length), 0) || 1;
  let cursor = 0;
  return pieces.map((word) => {
    const wordDuration = Math.max(120, Math.round((durationMs * Math.max(1, word.length)) / totalWeight));
    const startMs = cursor;
    cursor = Math.min(durationMs, cursor + wordDuration);
    return { text: word, startMs, endMs: cursor };
  });
}

function normalizeLayout(layout: string): SceneLayout {
  if (
    layout === "full_dh"
    || layout === "dh_top_broll_bottom"
    || layout === "broll_top_dh_bottom"
    || layout === "full_broll"
  ) {
    return layout;
  }
  return "full_broll";
}

function brandFromRequest(ipId: string, brand?: BrandInput): RenderProps["brand"] {
  const fallback = ipConfigs[ipId] ?? ipConfigs.wang;
  return {
    name: brand?.name || fallback.name,
    primaryColor: brand?.primaryColor || brand?.color || fallback.primaryColor,
    secondaryColor: brand?.secondaryColor || fallback.secondaryColor,
    logoText: brand?.logoText || brand?.name || fallback.logoText,
  };
}

function pickBroll(sceneSelection: SceneSelectionPreview | undefined) {
  const asset = sceneSelection?.slots.find((slot) => slot.slot === "broll")?.primaryAsset;
  if (!asset?.url) return {};
  if (asset.type === "video") return { brollVideo: asset.url };
  if (asset.type === "image") return { brollImages: [asset.url] };
  return {};
}

function buildLegacyScript(ipId: string): RenderProps {
  const brand = brandFromRequest(ipId);
  const scripts: Record<string, [string, string, string, string]> = {
    wang: [
      "普通餐饮门店如何在一个月内提升三倍转化？我是老王，做了十二年餐饮，今天说点实话。",
      "很多餐饮老板跟我反馈，客流不少，但复购率就是上不去。说到底，缺的不是流量，是一套标准化的客户转化流程。",
      "200+ 门店验证的增长模型",
      "现在私信「增长方案」，免费领取完整资料包。名额有限，先到先得！",
    ],
    li: [
      "中小企业如何在存量市场里找到增长引擎？我是李总，专注企业增长服务十年。",
      "大多数老板花钱买流量，但客户来了留不住。核心问题是你的增长体系里少了关键的一环。",
      "500+ 企业的共同选择",
      "私信「增长」，免费获取企业增长诊断报告。仅限前 20 名！",
    ],
    zhang: [
      "为什么同样的产品，有人卖了三年还是老样子，有人三个月做出品牌溢价？我是张姐。",
      "做美妆的人太多了，但真正懂品牌运营的没几个。不是产品不够好，是你的产品故事没有讲好。",
      "让产品溢价最高翻 3 倍",
      "评论区扣「品牌」，我把这份品牌溢价方法论完整版发给你。先到先得！",
    ],
  };
  const s = scripts[ipId] || scripts.wang;

  return {
    brand,
    scenes: [
      { id: "hook", role: "hook", layout: "full_dh", startSec: 0, durationSec: 5, subtitleWords: subtitleWords(s[0], 5000) },
      { id: "pain", role: "pain", layout: "dh_top_broll_bottom", startSec: 5, durationSec: 10, subtitleWords: subtitleWords(s[1], 10000) },
      {
        id: "proof",
        role: "proof",
        layout: "full_broll",
        startSec: 15,
        durationSec: 8,
        subtitleWords: [{ text: s[2], startMs: 0, endMs: 8000 }],
        overlayText: s[2],
      },
      { id: "cta", role: "cta", layout: "full_dh", startSec: 23, durationSec: 7, subtitleWords: subtitleWords(s[3], 7000) },
    ],
  };
}

function buildTimeline(data: RenderRequest): RenderProps {
  const ipId = data.ipId ?? data.brand?.id ?? "wang";
  if (!data.script?.scenes?.length) return buildLegacyScript(ipId);

  const brand = brandFromRequest(ipId, data.brand);
  const selectionsByScene = new Map((data.selection?.selections ?? []).map((scene) => [scene.sceneId, scene]));
  const ttsByScene = new Map((data.tts?.clips ?? []).map((clip) => [clip.sceneId, clip]));
  const digitalHumanByScene = new Map((data.digitalHuman?.clips ?? []).map((clip) => [clip.sceneId, clip]));
  const planScenesById = new Map((data.script.videoPlan?.scenes ?? []).map((scene) => [scene.id, scene]));
  let cursorSec = 0;

  const scenes = data.script.scenes.map((scene): TimelineScene => {
    const planScene = planScenesById.get(scene.id);
    const tts = ttsByScene.get(scene.id);
    const digitalHuman = digitalHumanByScene.get(scene.id);
    const plannedMs = Math.max(1000, Math.round((scene.durationSec || 4) * 1000));
    const durationMs = Math.max(plannedMs, tts?.durationMs ?? 0, digitalHuman?.durationMs ?? 0);
    const durationSec = Math.max(1, durationMs / 1000);
    const layout = normalizeLayout(scene.layout);
    const broll = pickBroll(selectionsByScene.get(scene.id));
    const timelineScene: TimelineScene = {
      id: scene.id,
      role: scene.role,
      layout,
      startSec: cursorSec,
      durationSec,
      digitalHumanVideo: digitalHuman?.alphaVideoUrl || digitalHuman?.videoUrl,
      audioUrl: tts?.audioUrl,
      subtitleWords: tts?.words?.length ? tts.words : subtitleWords(scene.copy, durationMs),
      overlayText: layout === "full_broll" ? planScene?.visualGoal || scene.copy : undefined,
      transition: planScene?.transition,
      ...broll,
    };

    cursorSec += durationSec;
    return timelineScene;
  });

  return {
    brand,
    scenes,
    bgmUrl: data.selection?.global?.bgm?.url,
  };
}

function getRemotionServeUrl() {
  if (!remotionServeUrl) {
    remotionServeUrl = bundle({
      entryPoint: path.join(process.cwd(), "src", "remotion", "index.ts"),
    });
  }
  return remotionServeUrl;
}

async function renderRemotion(props: RenderProps, outputPath: string) {
  const serveUrl = await getRemotionServeUrl();
  const compositions = await getCompositions(serveUrl, { inputProps: props });
  const composition = compositions.find((item) => item.id === "SplitScreen");
  if (!composition) throw new Error("SplitScreen composition not found");

  await renderMedia({
    codec: "h264",
    composition,
    inputProps: props,
    outputLocation: outputPath,
    serveUrl,
  });
}

function getFfmpegCommand() {
  const configured = process.env.FFMPEG_PATH;
  if (configured && fs.existsSync(configured)) return configured;

  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const staticBinary = path.join(process.cwd(), "node_modules", "ffmpeg-static", exe);
  if (fs.existsSync(staticBinary)) return staticBinary;

  return "ffmpeg";
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
      timeout: 5 * 60 * 1000,
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

function inspectMedia(command: string, inputPath: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, ["-hide_banner", "-i", inputPath], {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
    });

    let output = "";
    const appendOutput = (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-6000);
    };

    child.stdout?.on("data", appendOutput);
    child.stderr?.on("data", appendOutput);
    child.on("error", reject);
    child.on("close", () => resolve(output));
  });
}

async function postProcessVideo(inputPath: string, outputId: string) {
  const ffmpeg = getFfmpegCommand();
  const publicDir = path.join(process.cwd(), "public", "output");
  const coverDir = path.join(publicDir, "covers");
  const previewDir = path.join(publicDir, "previews");
  fs.mkdirSync(coverDir, { recursive: true });
  fs.mkdirSync(previewDir, { recursive: true });

  const finalPath = path.join(publicDir, `${outputId}.mp4`);
  const coverPath = path.join(coverDir, `${outputId}.jpg`);
  const previewPath = path.join(previewDir, `${outputId}_preview.mp4`);
  const info = await inspectMedia(ffmpeg, inputPath);
  const hasAudio = info.includes("Audio:");
  const finalArgs = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
  ];

  if (hasAudio) {
    finalArgs.push("-af", "loudnorm=I=-16:LRA=11:TP=-1.5", "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "160k");
  } else {
    finalArgs.push("-an");
  }

  finalArgs.push("-movflags", "+faststart", finalPath);
  await runCommand(ffmpeg, finalArgs);

  const previewArgs = [
    "-y",
    "-i",
    finalPath,
    "-vf",
    "scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
  ];

  if (hasAudio) {
    previewArgs.push("-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "64k");
  } else {
    previewArgs.push("-an");
  }

  previewArgs.push("-movflags", "+faststart", previewPath);
  await runCommand(ffmpeg, previewArgs);

  await runCommand(ffmpeg, [
    "-y",
    "-ss",
    "1",
    "-i",
    finalPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    coverPath,
  ]);

  return {
    resultUrl: `/output/${outputId}.mp4`,
    previewUrl: `/output/previews/${outputId}_preview.mp4`,
    coverUrl: `/output/covers/${outputId}.jpg`,
    hasAudio,
  };
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const data = typeof body === "object" && body !== null ? body as RenderRequest : {};
  const ipId = data.ipId ?? data.brand?.id ?? "wang";
  const brand = brandFromRequest(ipId, data.brand);
  const taskId = `task_${ipId}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  if (!ipConfigs[ipId] && !data.brand) {
    return Response.json({ error: "Unknown IP" }, { status: 400 });
  }

  await createRenderTask({
    id: taskId,
    brandId: ipId,
    brandName: brand.name,
    templateId: data.template?.id ?? "default",
    templateName: data.template?.name ?? "默认模板",
    platform: data.script?.platform ?? "未知平台",
    videoPlanId: data.script?.videoPlan?.id,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        send({ taskId, status: "任务已创建，正在组装 Timeline..." });
        await updateRenderTask(taskId, { status: "running", stage: "正在组装 Timeline..." });
        const timeline = buildTimeline(data);

        send({ status: `Remotion 同屏合成中：${timeline.scenes.length} 个分镜...` });
        await updateRenderTask(taskId, {
          status: "running",
          stage: `Remotion 同屏合成中：${timeline.scenes.length} 个分镜`,
          scenes: timeline.scenes.length,
        });

        const outputId = `cutix_${ipId}_${Date.now()}`;
        const outputFile = path.join(os.tmpdir(), `${outputId}.mp4`);

        await renderRemotion(timeline, outputFile);

        send({ status: "FFmpeg 后处理中：标准化、封面、低清预览..." });
        await updateRenderTask(taskId, { status: "running", stage: "FFmpeg 后处理中" });
        const postProcessed = await postProcessVideo(outputFile, outputId);
        fs.rmSync(outputFile, { force: true });

        await updateRenderTask(taskId, {
          status: "completed",
          stage: "完成",
          resultUrl: postProcessed.resultUrl,
          previewUrl: postProcessed.previewUrl,
          coverUrl: postProcessed.coverUrl,
          hasAudio: postProcessed.hasAudio,
          scenes: timeline.scenes.length,
          completedAt: new Date().toISOString(),
        });

        send({
          taskId,
          status: "完成！",
          resultUrl: postProcessed.resultUrl,
          previewUrl: postProcessed.previewUrl,
          coverUrl: postProcessed.coverUrl,
          hasAudio: postProcessed.hasAudio,
          scenes: timeline.scenes.length,
        });
      } catch (error: unknown) {
        console.error("Render error:", error);
        const message = error instanceof Error ? error.message : "Unknown render error";
        await updateRenderTask(taskId, {
          status: "failed",
          stage: "失败",
          error: message,
          completedAt: new Date().toISOString(),
        });
        send({ taskId, status: `失败: ${message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
