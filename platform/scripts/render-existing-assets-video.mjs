import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const baseUrl = process.env.CUTIX_BASE_URL || "http://127.0.0.1:3000";
const rootDir = process.cwd();
const assetsPath = path.join(rootDir, "data", "assets.json");

const preferredAssetIds = [
  "commons-video-cafe",
  "commons-video-kitchen",
  "commons-retail-interior",
  "commons-product-display",
  "commons-business-chart",
];

const scenes = [
  {
    id: "hook",
    role: "hook",
    layout: "full_broll",
    durationSec: 5,
    copy: "一家餐饮店要做增长，先别急着投流，先把门店画面、产品和成交动作做成可复制的视频资产。",
    needsDigitalHuman: false,
  },
  {
    id: "pain",
    role: "pain",
    layout: "full_broll",
    durationSec: 7,
    copy: "很多老板的问题不是没有素材，而是素材散在手机和硬盘里，没人分类，也没人知道哪段适合招商，哪段适合转化。",
    needsDigitalHuman: false,
  },
  {
    id: "system",
    role: "solution",
    layout: "full_broll",
    durationSec: 6,
    copy: "Cutix 会把本地素材入库打标签，匹配品牌口吻，再按模板自动生成短视频。",
    needsDigitalHuman: false,
  },
  {
    id: "proof",
    role: "proof",
    layout: "full_broll",
    durationSec: 6,
    copy: "同一套厨房、门店和产品素材，可以批量产出招商、活动、案例和直播预热视频。",
    needsDigitalHuman: false,
  },
  {
    id: "cta",
    role: "cta",
    layout: "full_broll",
    durationSec: 5,
    copy: "把素材库建起来，老板每天只需要审核结果，视频工厂就能持续出片。",
    needsDigitalHuman: false,
  },
];

const visualGoals = {
  hook: "门店增长先做素材资产",
  pain: "素材分散，出片就慢",
  system: "本地标签 + 模板生成",
  proof: "一套素材，多类视频",
  cta: "审核结果，持续出片",
};

function materialSlotForScene(scene) {
  const tagsByRole = {
    hook: ["门店", "增长", "B-roll"],
    pain: ["素材库", "分类", "转化"],
    solution: ["标签", "模板", "自动生成"],
    proof: ["案例", "产品", "招商"],
    cta: ["审核", "批量出片", "视频工厂"],
  };
  const slot = scene.role === "proof" ? "proof" : scene.role === "solution" ? "product" : "broll";

  return {
    slot,
    label: scene.role === "proof" ? "证明素材" : scene.role === "solution" ? "产品/方案素材" : "场景 B-roll",
    requiredTypes: ["video", "image"],
    tags: tagsByRole[scene.role] || ["商业IP", "B-roll"],
    purpose: scene.role === "proof" ? "强化多模板复用能力" : "承接口播内容，提供真实画面证据",
    placement: "primary",
  };
}

const script = {
  title: "餐饮门店增长视频资产短片",
  platform: "douyin-9x16",
  cta: "审核结果，持续出片",
  scenes,
  videoPlan: {
    id: `local-assets-plan-${Date.now()}`,
    schemaVersion: "cutix.video_plan.v1",
    version: 1,
    createdAt: new Date().toISOString(),
    aspectRatio: "9:16",
    platform: "douyin-9x16",
    totalDurationSec: scenes.reduce((sum, scene) => sum + scene.durationSec, 0),
    global: {
      pacing: "fast",
      bgmMood: "商业节奏",
      subtitleStyle: "bottom_bar",
      brandElements: ["老王餐饮增长", "餐饮增长", "本地素材"],
    },
    scenes: [
      { id: "hook", role: "hook", transition: "cut" },
      { id: "pain", role: "pain", transition: "fade" },
      { id: "system", role: "solution", transition: "slide" },
      { id: "proof", role: "proof", transition: "zoom" },
      { id: "cta", role: "cta", transition: "fade" },
    ].map((scenePlan) => {
      const sourceScene = scenes.find((scene) => scene.id === scenePlan.id);
      return {
        ...scenePlan,
        layout: "full_broll",
        durationSec: sourceScene.durationSec,
        narration: sourceScene.copy,
        visualGoal: visualGoals[sourceScene.id],
        digitalHuman: {
          enabled: false,
          text: "",
          placement: "voiceover",
        },
        materialSlots: [materialSlotForScene(sourceScene)],
        subtitle: {
          style: sourceScene.role === "proof" ? "center_emphasis" : "bottom_bar",
          emphasis: materialSlotForScene(sourceScene).tags.slice(0, 3),
        },
      };
    }),
  },
};

function assertUsableAsset(asset, id) {
  if (!asset) throw new Error(`Missing asset: ${id}`);
  if (asset.status !== "ready") throw new Error(`Asset is not ready: ${id}`);
  if (!asset.url) throw new Error(`Asset has no URL: ${id}`);
  if (asset.type !== "video" && asset.type !== "image") throw new Error(`Unsupported asset type for ${id}: ${asset.type}`);
  return asset;
}

async function postJson(pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${pathname} HTTP ${response.status}: ${text.slice(0, 600)}`);
  }

  return response.json();
}

async function postRender(payload) {
  const response = await fetch(`${baseUrl}/api/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`/api/render HTTP ${response.status}: ${text.slice(0, 600)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("/api/render returned no stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let finalEvent = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice(6));
      finalEvent = event;
      if (event.status) console.log(`[render] ${event.status}`);
      if (typeof event.status === "string" && event.status.startsWith("失败")) {
        throw new Error(event.status);
      }
    }
  }

  if (!finalEvent?.resultUrl) {
    throw new Error(`Render did not return a result URL: ${JSON.stringify(finalEvent)}`);
  }

  return finalEvent;
}

async function main() {
  const assets = JSON.parse(await fs.readFile(assetsPath, "utf8"));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const selectedAssets = preferredAssetIds.map((id) => assertUsableAsset(assetsById.get(id), id));

  const selection = {
    selections: scenes.map((scene, index) => {
      const asset = selectedAssets[index % selectedAssets.length];
      return {
        sceneId: scene.id,
        slots: [
          {
            slot: "broll",
            primaryAsset: {
              id: asset.id,
              name: asset.name,
              type: asset.type,
              url: asset.url,
            },
          },
        ],
      };
    }),
    global: {
      bgm: null,
    },
  };

  console.log(`[cutix] baseUrl=${baseUrl}`);
  console.log(`[cutix] selected assets=${selectedAssets.map((asset) => `${asset.id}:${asset.type}`).join(", ")}`);
  console.log("[cutix] digitalHuman.clips=0; no placeholder digital human will be rendered");

  let tts = null;
  try {
    tts = await postJson("/api/tts", {
      script,
      provider: process.env.CUTIX_TTS_PROVIDER || "auto",
      voiceId: process.env.CUTIX_TTS_VOICE || "中文女",
      speed: Number(process.env.CUTIX_TTS_SPEED || "1.02"),
    });
    console.log(`[tts] provider=${tts.provider}; clips=${tts.clips.length}; totalMs=${tts.totalDurationMs}`);
  } catch (error) {
    console.warn(`[tts] skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  const result = await postRender({
    ipId: "wang",
    brand: {
      id: "wang",
      name: "老王餐饮增长",
      primaryColor: "#E7333F",
      secondaryColor: "#121826",
      logoText: "餐饮增长",
    },
    template: {
      id: "local-asset-commercial-ip",
      name: "本地素材商业IP短片",
    },
    script,
    selection,
    tts,
    digitalHuman: { clips: [] },
  });

  console.log(`[cutix] result=${baseUrl}${result.resultUrl}`);
  console.log(`[cutix] preview=${baseUrl}${result.previewUrl}`);
  console.log(`[cutix] cover=${baseUrl}${result.coverUrl}`);
  console.log(`[cutix] hasAudio=${result.hasAudio}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
