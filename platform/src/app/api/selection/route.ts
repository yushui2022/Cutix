import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AssetType = "video" | "image" | "audio" | "avatar";
type Orientation = "9:16" | "16:9" | "1:1";
type AssetStatus = "ready" | "review" | "disabled";
type SceneLayout = "full_dh" | "dh_top_broll_bottom" | "broll_top_dh_bottom" | "full_broll";
type SceneRole = "hook" | "pain" | "solution" | "proof" | "cta";
type SlotType = "digital_human" | "broll";

type Asset = {
  id: string;
  name: string;
  type: AssetType;
  duration: string;
  orientation: Orientation;
  tags: string[];
  status: AssetStatus;
  color: string;
  source: string;
  matchScore: number;
  url?: string;
  thumbnailUrl?: string;
};

type ScriptScene = {
  id: string;
  role: SceneRole | string;
  layout: SceneLayout | string;
  durationSec: number;
  copy: string;
  visualTags: string[];
  needsDigitalHuman: boolean;
};

type VideoPlanMaterialSlot = {
  slot?: string;
  label?: string;
  requiredTypes?: AssetType[];
  tags?: string[];
};

type VideoPlanScene = {
  id: string;
  digitalHuman?: {
    enabled?: boolean;
  };
  materialSlots?: VideoPlanMaterialSlot[];
};

type GeneratedScript = {
  title: string;
  platform: string;
  scenes: ScriptScene[];
  cta: string;
  videoPlan?: {
    scenes?: VideoPlanScene[];
  };
};

type SelectionRequest = {
  script?: GeneratedScript;
  assets?: Asset[];
  targetPlatform?: string;
};

type ScoredAsset = Asset & {
  score: number;
  matchedTags: string[];
  reasons: string[];
};

type SlotSelection = {
  slot: SlotType;
  label: string;
  requiredTypes: AssetType[];
  requiredTags: string[];
  primaryAsset: ScoredAsset | null;
  backupAssets: ScoredAsset[];
  warning?: string;
};

const roleTagHints: Record<string, string[]> = {
  hook: ["开场", "热闹", "IP", "数字人", "口播"],
  pain: ["痛点", "门店", "人流", "经营"],
  solution: ["方案", "产品", "服务", "流程"],
  proof: ["案例", "客户", "数据", "证明"],
  cta: ["CTA", "结尾", "口播", "数字人"],
};

const layoutBrollLayouts = new Set(["dh_top_broll_bottom", "broll_top_dh_bottom", "full_broll"]);
const layoutDigitalHumanLayouts = new Set(["full_dh", "dh_top_broll_bottom", "broll_top_dh_bottom"]);

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(tag.trim());
  }
  return result.slice(0, 12);
}

function getMatchedTags(assetTags: string[], requiredTags: string[]) {
  const normalizedAssetTags = assetTags.map(normalizeTag);
  const matches: string[] = [];

  for (const requiredTag of requiredTags) {
    const normalizedRequired = normalizeTag(requiredTag);
    if (!normalizedRequired) continue;

    const matched = normalizedAssetTags.some(
      (assetTag) => assetTag === normalizedRequired
        || assetTag.includes(normalizedRequired)
        || normalizedRequired.includes(assetTag),
    );
    if (matched) matches.push(requiredTag.trim());
  }

  return uniqueTags(matches);
}

function requiredTagsForScene(scene: ScriptScene, slot: SlotType, planScene: VideoPlanScene | undefined) {
  const planTags = slot === "broll"
    ? (planScene?.materialSlots ?? []).flatMap((materialSlot) => materialSlot.tags ?? [])
    : [];
  const tags = uniqueTags([
    ...scene.visualTags,
    ...planTags,
    ...(roleTagHints[scene.role] ?? []),
  ]);

  if (slot === "digital_human") {
    return uniqueTags(["数字人", "口播", "IP", ...tags]);
  }

  return tags.filter((tag) => !["数字人", "口播", "IP", "CTA", "结尾"].includes(tag));
}

function validRequiredTypes(types: AssetType[] | undefined): AssetType[] {
  const filtered = (types ?? []).filter((type) => type === "video" || type === "image");
  return filtered.length ? filtered : ["video", "image"];
}

function slotsForScene(
  scene: ScriptScene,
  planScene: VideoPlanScene | undefined,
): Array<{ slot: SlotType; label: string; requiredTypes: AssetType[] }> {
  const slots: Array<{ slot: SlotType; label: string; requiredTypes: AssetType[] }> = [];
  const layout = scene.layout;
  const materialSlots = planScene?.materialSlots ?? [];
  const needsDigitalHuman = planScene?.digitalHuman?.enabled === true
    || scene.needsDigitalHuman
    || layoutDigitalHumanLayouts.has(layout);

  if (needsDigitalHuman) {
    slots.push({ slot: "digital_human", label: "数字人", requiredTypes: ["avatar", "video"] });
  }

  if (materialSlots.length > 0) {
    const requiredTypes: AssetType[] = Array.from(
      new Set(materialSlots.flatMap((slot) => validRequiredTypes(slot.requiredTypes))),
    );
    slots.push({
      slot: "broll",
      label: materialSlots[0]?.label || "B-roll",
      requiredTypes,
    });
  } else if (layoutBrollLayouts.has(layout)) {
    slots.push({ slot: "broll", label: "B-roll", requiredTypes: ["video", "image"] });
  }

  return slots;
}

function statusScore(status: AssetStatus) {
  if (status === "ready") return 18;
  if (status === "review") return 8;
  return -1000;
}

function orientationScore(asset: Asset, targetPlatform: string | undefined) {
  const shortVideoPlatform = !targetPlatform || ["抖音", "视频号", "小红书", "快手"].includes(targetPlatform);
  if (asset.type === "audio") return 0;
  if (shortVideoPlatform && asset.orientation === "9:16") return 12;
  if (!shortVideoPlatform && asset.orientation === "16:9") return 10;
  if (asset.orientation === "1:1") return 3;
  return 0;
}

function typeScore(asset: Asset, slot: SlotType) {
  if (slot === "digital_human") {
    if (asset.type === "avatar") return 34;
    if (asset.type === "video" && asset.tags.some((tag) => ["数字人", "口播"].includes(tag))) return 22;
    return -1000;
  }

  if (asset.type === "video") return 22;
  if (asset.type === "image") return 16;
  return -1000;
}

function scoreAsset(
  asset: Asset,
  slot: SlotType,
  requiredTypes: AssetType[],
  requiredTags: string[],
  targetPlatform: string | undefined,
  usedBrollIds: Set<string>,
): ScoredAsset {
  const matchedTags = getMatchedTags(asset.tags, requiredTags);
  const reasons: string[] = [];
  const requiredTypeBonus = requiredTypes.includes(asset.type) ? 8 : -1000;
  const reusePenalty = slot === "broll" && usedBrollIds.has(asset.id) ? -12 : 0;
  const baseScore = statusScore(asset.status)
    + typeScore(asset, slot)
    + requiredTypeBonus
    + orientationScore(asset, targetPlatform)
    + Math.min(12, Math.round(asset.matchScore / 8))
    + matchedTags.length * 14
    + reusePenalty;

  if (asset.status === "ready") reasons.push("已启用");
  if (asset.status === "review") reasons.push("待复核但可候选");
  if (asset.orientation === "9:16") reasons.push("竖屏适配");
  if (matchedTags.length > 0) reasons.push(`命中标签：${matchedTags.join("、")}`);
  if (reusePenalty < 0) reasons.push("重复使用降权");

  return {
    ...asset,
    score: Math.max(0, Math.min(100, baseScore)),
    matchedTags,
    reasons,
  };
}

function pickSlot(
  assets: Asset[],
  slot: SlotType,
  label: string,
  requiredTypes: AssetType[],
  requiredTags: string[],
  targetPlatform: string | undefined,
  usedBrollIds: Set<string>,
): SlotSelection {
  const candidates = assets
    .filter((asset) => asset.status !== "disabled")
    .map((asset) => scoreAsset(asset, slot, requiredTypes, requiredTags, targetPlatform, usedBrollIds))
    .filter((asset) => asset.score > 0)
    .sort((left, right) => right.score - left.score);

  const primaryAsset = candidates[0] ?? null;
  if (primaryAsset && slot === "broll") usedBrollIds.add(primaryAsset.id);

  return {
    slot,
    label,
    requiredTypes,
    requiredTags,
    primaryAsset,
    backupAssets: candidates.slice(1, 4),
    warning: primaryAsset ? undefined : `没有可用的${label}素材`,
  };
}

function selectGlobalBgm(assets: Asset[]) {
  return assets
    .filter((asset) => asset.status !== "disabled" && asset.type === "audio")
    .map((asset) => {
      const matchedTags = getMatchedTags(asset.tags, ["BGM", "音乐", "专业", "稳定"]);
      return {
        ...asset,
        matchedTags,
        reasons: matchedTags.length > 0 ? [`命中标签：${matchedTags.join("、")}`] : ["音频候选"],
        score: Math.min(100, statusScore(asset.status) + Math.round(asset.matchScore / 4) + matchedTags.length * 12),
      };
    })
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

function summarizeSelectedIds(selections: Array<{ slots: SlotSelection[] }>, bgm: ScoredAsset | null) {
  const ids = new Set<string>();
  for (const scene of selections) {
    for (const slot of scene.slots) {
      if (slot.primaryAsset) ids.add(slot.primaryAsset.id);
    }
  }
  if (bgm) ids.add(bgm.id);
  return Array.from(ids);
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const data = typeof body === "object" && body !== null ? body as SelectionRequest : {};

  if (!data.script || !Array.isArray(data.script.scenes)) {
    return Response.json({ error: "script.scenes is required" }, { status: 400 });
  }

  const assets = Array.isArray(data.assets) ? data.assets : [];
  const usedBrollIds = new Set<string>();
  const planScenesById = new Map((data.script.videoPlan?.scenes ?? []).map((scene) => [scene.id, scene]));
  const selections = data.script.scenes.map((scene) => {
    const planScene = planScenesById.get(scene.id);
    const slots = slotsForScene(scene, planScene).map((slot) =>
      pickSlot(
        assets,
        slot.slot,
        slot.label,
        slot.requiredTypes,
        requiredTagsForScene(scene, slot.slot, planScene),
        data.targetPlatform ?? data.script?.platform,
        usedBrollIds,
      ),
    );

    return {
      sceneId: scene.id,
      role: scene.role,
      layout: scene.layout,
      copy: scene.copy,
      slots,
      warnings: slots.map((slot) => slot.warning).filter(Boolean),
    };
  });

  const bgm = selectGlobalBgm(assets);
  const slotCount = selections.reduce((sum, scene) => sum + scene.slots.length, 0) + 1;
  const filledSlotCount = selections.reduce(
    (sum, scene) => sum + scene.slots.filter((slot) => slot.primaryAsset).length,
    bgm ? 1 : 0,
  );

  return Response.json(
    {
      selections,
      global: {
        bgm,
        warning: bgm ? undefined : "没有可用的 BGM 素材",
      },
      selectedAssetIds: summarizeSelectedIds(selections, bgm),
      coverage: {
        scenes: selections.length,
        slots: slotCount,
        filledSlots: filledSlotCount,
        ratio: slotCount === 0 ? 0 : Math.round((filledSlotCount / slotCount) * 100),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
