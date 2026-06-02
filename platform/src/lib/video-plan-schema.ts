import crypto from "crypto";

export const VIDEO_PLAN_SCHEMA_VERSION = "cutix.video_plan.v1" as const;

const sceneRoles = ["hook", "pain", "solution", "proof", "cta"] as const;
const sceneLayouts = ["full_dh", "dh_top_broll_bottom", "broll_top_dh_bottom", "full_broll"] as const;
const transitions = ["cut", "fade", "slide", "zoom"] as const;
const subtitleStyles = ["bottom_bar", "center_emphasis", "minimal"] as const;

export type VideoPlanSceneRole = typeof sceneRoles[number];
export type VideoPlanSceneLayout = typeof sceneLayouts[number];
export type VideoPlanTransition = typeof transitions[number];
export type VideoPlanSubtitleStyle = typeof subtitleStyles[number];

export type VideoPlanSourceScene = {
  id: string;
  role: string;
  layout: string;
  durationSec: number;
  copy: string;
  visualTags?: string[];
  needsDigitalHuman?: boolean;
};

export type VideoPlanSourceScript = {
  title?: string;
  platform?: string;
  brandId?: string;
  templateId?: string;
  tone?: string;
  scenes: VideoPlanSourceScene[];
  cta?: string;
};

export type VideoPlanBuildContext = {
  brand?: {
    id?: string;
    name?: string;
    industry?: string;
    tone?: string;
    promise?: string;
  };
  template?: {
    id?: string;
    name?: string;
  };
  targetPlatform?: string;
};

export type VideoPlanMaterialSlot = {
  slot: "broll" | "product" | "proof" | "background";
  label: string;
  requiredTypes: Array<"video" | "image">;
  tags: string[];
  purpose: string;
  placement: "primary" | "support" | "background";
};

export type VideoPlanScene = {
  id: string;
  role: VideoPlanSceneRole;
  layout: VideoPlanSceneLayout;
  durationSec: number;
  narration: string;
  visualGoal: string;
  digitalHuman: {
    enabled: boolean;
    text: string;
    placement: "full" | "top" | "bottom" | "voiceover";
  };
  materialSlots: VideoPlanMaterialSlot[];
  subtitle: {
    style: VideoPlanSubtitleStyle;
    emphasis: string[];
  };
  transition: VideoPlanTransition;
};

export type VideoPlan = {
  id: string;
  schemaVersion: typeof VIDEO_PLAN_SCHEMA_VERSION;
  version: 1;
  createdAt: string;
  aspectRatio: "9:16";
  platform: string;
  totalDurationSec: number;
  global: {
    pacing: "steady" | "fast" | "dramatic";
    bgmMood: string;
    subtitleStyle: "bottom_bar";
    brandElements: string[];
  };
  scenes: VideoPlanScene[];
};

export type VideoPlanValidationResult = {
  valid: boolean;
  issues: string[];
};

export type NormalizedVideoPlanResult = {
  videoPlan: VideoPlan;
  repaired: boolean;
  issues: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function uniqueTags(tags: string[] | undefined) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 8);
}

function sanitizeId(value: string) {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "plan";
}

function roleForScene(scene: VideoPlanSourceScene, index: number): VideoPlanSceneRole {
  if (oneOf(scene.role, sceneRoles)) return scene.role;
  return sceneRoles[Math.min(index, sceneRoles.length - 1)];
}

function layoutForScene(scene: VideoPlanSourceScene): VideoPlanSceneLayout {
  if (oneOf(scene.layout, sceneLayouts)) return scene.layout;
  return scene.needsDigitalHuman ? "dh_top_broll_bottom" : "full_broll";
}

function digitalHumanPlacement(layout: VideoPlanSceneLayout): VideoPlanScene["digitalHuman"]["placement"] {
  if (layout === "full_dh") return "full";
  if (layout === "dh_top_broll_bottom") return "top";
  if (layout === "broll_top_dh_bottom") return "bottom";
  return "voiceover";
}

function materialSlotsForScene(
  scene: VideoPlanSourceScene,
  role: VideoPlanSceneRole,
  layout: VideoPlanSceneLayout,
): VideoPlanMaterialSlot[] {
  if (layout === "full_dh") return [];

  const tags = uniqueTags((scene.visualTags ?? []).filter((tag) => !["数字人", "口播", "IP", "CTA", "结尾"].includes(tag)));
  return [
    {
      slot: role === "proof" ? "proof" : role === "solution" ? "product" : "broll",
      label: role === "proof" ? "证明素材" : role === "solution" ? "产品/方案素材" : "场景 B-roll",
      requiredTypes: ["video", "image"],
      tags,
      purpose: role === "proof" ? "用真实案例或数据强化可信度" : "承接口播内容，提供画面证据",
      placement: layout === "full_broll" ? "primary" : "support",
    } satisfies VideoPlanMaterialSlot,
  ];
}

function createVideoPlanId(script: VideoPlanSourceScript, context: VideoPlanBuildContext) {
  const brandId = script.brandId ?? context.brand?.id ?? "brand";
  const templateId = script.templateId ?? context.template?.id ?? "template";
  return `vp_${sanitizeId(brandId)}_${sanitizeId(templateId)}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function isValidIsoDate(value: string) {
  return Number.isFinite(Date.parse(value));
}

export function buildVideoPlan(script: VideoPlanSourceScript, context: VideoPlanBuildContext = {}): VideoPlan {
  const platform = script.platform || context.targetPlatform || "抖音";
  const scenes = script.scenes.map((scene, index): VideoPlanScene => {
    const role = roleForScene(scene, index);
    const layout = layoutForScene(scene);
    const durationSec = Math.max(3, Math.min(20, Math.round(Number(scene.durationSec) || 5)));
    const narration = scene.copy || "";
    const needsDigitalHuman = scene.needsDigitalHuman === true || layout !== "full_broll";
    const visualTags = uniqueTags(scene.visualTags);

    return {
      id: scene.id || role,
      role,
      layout,
      durationSec,
      narration,
      visualGoal: `${role} 段落用 ${visualTags.join("、") || "品牌"} 素材支撑口播`,
      digitalHuman: {
        enabled: needsDigitalHuman,
        text: needsDigitalHuman ? narration : "",
        placement: digitalHumanPlacement(layout),
      },
      materialSlots: materialSlotsForScene(scene, role, layout),
      subtitle: {
        style: role === "proof" ? "center_emphasis" : "bottom_bar",
        emphasis: uniqueTags(visualTags.slice(0, 3)),
      },
      transition: index === 0 ? "cut" : role === "proof" ? "zoom" : "fade",
    };
  });

  return {
    id: createVideoPlanId(script, context),
    schemaVersion: VIDEO_PLAN_SCHEMA_VERSION,
    version: 1,
    createdAt: new Date().toISOString(),
    aspectRatio: "9:16",
    platform,
    totalDurationSec: scenes.reduce((sum, scene) => sum + scene.durationSec, 0),
    global: {
      pacing: platform === "小红书" ? "steady" : "fast",
      bgmMood: (script.tone ?? context.brand?.tone ?? "").includes("理性") ? "克制可信" : "商业节奏",
      subtitleStyle: "bottom_bar",
      brandElements: uniqueTags([
        context.brand?.name,
        context.brand?.industry,
        context.brand?.promise,
        script.title,
      ].filter((value): value is string => Boolean(value))),
    },
    scenes,
  };
}

export function validateVideoPlan(value: unknown, script: VideoPlanSourceScript): VideoPlanValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["videoPlan must be an object"] };

  if (value.schemaVersion !== VIDEO_PLAN_SCHEMA_VERSION) issues.push("schemaVersion mismatch");
  if (value.version !== 1) issues.push("version must be 1");
  if (value.aspectRatio !== "9:16") issues.push("aspectRatio must be 9:16");
  if (typeof value.id !== "string" || !value.id) issues.push("id is required");
  if (typeof value.createdAt !== "string" || !isValidIsoDate(value.createdAt)) issues.push("createdAt must be ISO date");
  if (typeof value.platform !== "string" || !value.platform) issues.push("platform is required");
  if (!Array.isArray(value.scenes)) issues.push("scenes must be an array");

  const scenes = Array.isArray(value.scenes) ? value.scenes : [];
  if (scenes.length !== script.scenes.length) {
    issues.push(`scene count mismatch: expected ${script.scenes.length}, got ${scenes.length}`);
  }

  script.scenes.forEach((sourceScene, index) => {
    const planned = scenes[index];
    const expectedRole = roleForScene(sourceScene, index);
    const expectedLayout = layoutForScene(sourceScene);
    if (!isRecord(planned)) {
      issues.push(`scene[${index}] must be an object`);
      return;
    }

    if (planned.id !== sourceScene.id) issues.push(`scene[${index}].id mismatch`);
    if (planned.role !== expectedRole) issues.push(`scene[${index}].role mismatch`);
    if (planned.layout !== expectedLayout) issues.push(`scene[${index}].layout mismatch`);
    if (typeof planned.durationSec !== "number" || planned.durationSec < 1) {
      issues.push(`scene[${index}].durationSec must be positive number`);
    }
    if (typeof planned.narration !== "string") issues.push(`scene[${index}].narration must be string`);
    if (typeof planned.visualGoal !== "string") issues.push(`scene[${index}].visualGoal must be string`);
    if (!Array.isArray(planned.materialSlots)) issues.push(`scene[${index}].materialSlots must be array`);
    if (!isRecord(planned.digitalHuman)) {
      issues.push(`scene[${index}].digitalHuman must be object`);
    } else if (typeof planned.digitalHuman.enabled !== "boolean") {
      issues.push(`scene[${index}].digitalHuman.enabled must be boolean`);
    }
    if (!isRecord(planned.subtitle)) {
      issues.push(`scene[${index}].subtitle must be object`);
    } else if (!oneOf(planned.subtitle.style, subtitleStyles)) {
      issues.push(`scene[${index}].subtitle.style invalid`);
    }
    if (!oneOf(planned.transition, transitions)) issues.push(`scene[${index}].transition invalid`);
  });

  return { valid: issues.length === 0, issues };
}

export function normalizeVideoPlanForScript(
  value: unknown,
  script: VideoPlanSourceScript,
  context: VideoPlanBuildContext = {},
): NormalizedVideoPlanResult {
  const validation = validateVideoPlan(value, script);
  if (validation.valid) {
    return {
      videoPlan: value as VideoPlan,
      repaired: false,
      issues: [],
    };
  }

  return {
    videoPlan: buildVideoPlan(script, context),
    repaired: true,
    issues: validation.issues,
  };
}
