"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Activity,
  CheckCircle2,
  Clapperboard,
  Database,
  Download,
  FileText,
  MonitorCog,
  Play,
  RefreshCcw,
  Settings,
  Sparkles,
  Tags,
  UploadCloud,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { defaultBrands, defaultTemplates } from "@/lib/default-config";
import type { LucideIcon } from "lucide-react";

type IP = {
  id: string;
  name: string;
  industry: string;
  color: string;
  tone: string;
  promise: string;
  defaultBgm: string;
};

type Asset = {
  id: string;
  name: string;
  type: "video" | "image" | "audio" | "avatar";
  duration: string;
  orientation: "9:16" | "16:9" | "1:1";
  tags: string[];
  status: "ready" | "review" | "disabled";
  color: string;
  source: string;
  matchScore: number;
  url?: string;
  thumbnailUrl?: string;
  fileName?: string;
  size?: number;
  uploadedAt?: string;
};

type Template = {
  id: string;
  name: string;
  category: string;
  duration: string;
  layout: string;
  bestFor: string;
  accent: string;
};

type LlmProvider = "openai-compatible" | "ollama" | "vllm" | "custom";

type PublicLlmConfig = {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  temperature: number;
  apiKeySet: boolean;
  apiKeyPreview: string;
};

type LlmConfigDraft = Omit<PublicLlmConfig, "apiKeySet" | "apiKeyPreview"> & {
  apiKey: string;
};

type DigitalHumanProvider = "placeholder" | "musetalk-cli" | "http-api";

type PublicDigitalHumanConfig = {
  provider: DigitalHumanProvider;
  endpoint: string;
  avatarPath: string;
  pythonPath: string;
  apiKeySet: boolean;
  apiKeyPreview: string;
};

type DigitalHumanConfigDraft = Omit<PublicDigitalHumanConfig, "apiKeySet" | "apiKeyPreview"> & {
  apiKey: string;
};

type ScriptScene = {
  id: string;
  role: string;
  layout: string;
  durationSec: number;
  copy: string;
  visualTags: string[];
  needsDigitalHuman: boolean;
};

type VideoPlanMaterialSlot = {
  slot: string;
  label: string;
  requiredTypes: Array<Asset["type"]>;
  tags: string[];
  purpose: string;
  placement: string;
};

type VideoPlanScene = {
  id: string;
  role: string;
  layout: string;
  durationSec: number;
  narration: string;
  visualGoal: string;
  digitalHuman: {
    enabled: boolean;
    text: string;
    placement: string;
  };
  materialSlots: VideoPlanMaterialSlot[];
  subtitle: {
    style: string;
    emphasis: string[];
  };
  transition: string;
};

type VideoPlan = {
  id: string;
  schemaVersion: string;
  version: number;
  createdAt: string;
  aspectRatio: string;
  platform: string;
  totalDurationSec: number;
  global: {
    pacing: string;
    bgmMood: string;
    subtitleStyle: string;
    brandElements: string[];
  };
  scenes: VideoPlanScene[];
};

type GeneratedScript = {
  title: string;
  platform: string;
  scenes: ScriptScene[];
  cta: string;
  videoPlan?: VideoPlan;
};

type SelectionAsset = Pick<
  Asset,
  "id" | "name" | "type" | "duration" | "orientation" | "tags" | "status" | "color" | "source" | "url" | "thumbnailUrl"
> & {
  score: number;
  matchedTags: string[];
  reasons: string[];
};

type SlotSelection = {
  slot: string;
  label: string;
  requiredTypes: Asset["type"][];
  requiredTags: string[];
  primaryAsset: SelectionAsset | null;
  backupAssets: SelectionAsset[];
  warning?: string;
};

type SceneSelectionPreview = {
  sceneId: string;
  role: string;
  layout: string;
  copy: string;
  slots: SlotSelection[];
  warnings: string[];
};

type AssetSelectionPreview = {
  selections: SceneSelectionPreview[];
  global: {
    bgm: SelectionAsset | null;
    warning?: string;
  };
  selectedAssetIds: string[];
  coverage: {
    scenes: number;
    slots: number;
    filledSlots: number;
    ratio: number;
  };
};

type TtsWord = {
  text: string;
  startMs: number;
  endMs: number;
};

type TtsClip = {
  sceneId: string;
  role: string;
  layout: string;
  copy: string;
  audioUrl: string;
  durationMs: number;
  source: string;
  fallbackReason?: string;
  words: TtsWord[];
};

type TtsPreview = {
  jobId: string;
  provider: string;
  voiceId: string;
  clips: TtsClip[];
  totalDurationMs: number;
};

type DigitalHumanClip = {
  sceneId: string;
  role: string;
  layout: string;
  copy: string;
  audioUrl: string;
  videoUrl: string;
  sourceVideoUrl?: string;
  alphaVideoUrl?: string;
  durationMs: number;
  source: string;
  alpha: boolean;
  alphaMode?: string;
  alphaError?: string;
  placeholder: boolean;
};

type DigitalHumanPreview = {
  jobId: string;
  provider: string;
  alpha?: boolean;
  chromaKey?: {
    color: string;
    similarity: number;
    blend: number;
  } | null;
  clips: DigitalHumanClip[];
  errors: Array<{ sceneId: string; message: string }>;
  totalDurationMs: number;
};

type RenderTask = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  brandName: string;
  templateName: string;
  platform: string;
  videoPlanId?: string;
  resultUrl?: string;
  previewUrl?: string;
  coverUrl?: string;
  payloadStored?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type PipelineStep = {
  name: string;
  detail: string;
  icon: LucideIcon;
};

const defaultLlmConfig: PublicLlmConfig = {
  provider: "openai-compatible",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "qwen2.5:7b",
  temperature: 0.7,
  apiKeySet: false,
  apiKeyPreview: "",
};

const defaultDigitalHumanConfig: PublicDigitalHumanConfig = {
  provider: "placeholder",
  endpoint: "",
  avatarPath: "",
  pythonPath: "python",
  apiKeySet: false,
  apiKeyPreview: "",
};

const seedIps: IP[] = defaultBrands;
const seedTemplates: Template[] = defaultTemplates;
const alphaPreviewStyle = {
  backgroundColor: "#111827",
  backgroundImage:
    "linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)",
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
};

const seedAssets: Asset[] = [
  {
    id: "store",
    name: "门店人流素材",
    type: "video",
    duration: "00:18",
    orientation: "9:16",
    tags: ["门店", "人流", "开场", "热闹"],
    status: "ready",
    color: "#f97316",
    source: "素材库 / 餐饮招商",
    matchScore: 94,
  },
  {
    id: "product",
    name: "产品展示片段",
    type: "video",
    duration: "00:22",
    orientation: "9:16",
    tags: ["产品", "服务", "方案"],
    status: "ready",
    color: "#14b8a6",
    source: "素材库 / 产品展示",
    matchScore: 88,
  },
  {
    id: "avatar",
    name: "老王口播数字人",
    type: "avatar",
    duration: "接口返回",
    orientation: "9:16",
    tags: ["数字人", "口播", "IP"],
    status: "ready",
    color: "#a855f7",
    source: "数字人服务 / 已生成",
    matchScore: 100,
  },
  {
    id: "bgm",
    name: "商务节奏 BGM",
    type: "audio",
    duration: "01:20",
    orientation: "1:1",
    tags: ["BGM", "专业", "稳定"],
    status: "review",
    color: "#64748b",
    source: "音频库 / 商务",
    matchScore: 76,
  },
];

const pipeline: PipelineStep[] = [
  { name: "素材解析", detail: "转码、抽帧、读取元信息", icon: Database },
  { name: "自动标签", detail: "场景、人物、产品、镜头类型", icon: Tags },
  { name: "脚本编排", detail: "生成文案、分镜、布局和素材需求", icon: FileText },
  { name: "数字人接口", detail: "提交口播文本并等待回传视频", icon: UserRound },
  { name: "Remotion 合成", detail: "布局、字幕、BGM、转场", icon: Clapperboard },
  { name: "成品输出", detail: "批量渲染、预览、下载", icon: CheckCircle2 },
];

const platforms = ["抖音", "视频号", "小红书", "快手"];

const copyModes = [
  { id: "auto", label: "自动生成", desc: "按 IP 口吻和素材标签生成" },
  { id: "rewrite", label: "标签改写", desc: "基于素材标签做批量变体" },
  { id: "import", label: "导入文案", desc: "保留人工文案，只做排版合成" },
];

const typeLabel: Record<Asset["type"], string> = {
  video: "视频",
  image: "图片",
  audio: "音频",
  avatar: "数字人",
};

const statusLabel: Record<Asset["status"], string> = {
  ready: "可用",
  review: "待复核",
  disabled: "禁用",
};

const statusStyle: Record<Asset["status"], string> = {
  ready: "bg-emerald-400/10 text-emerald-300 border border-emerald-400/20",
  review: "bg-amber-400/10 text-amber-300 border border-amber-400/20",
  disabled: "bg-white/5 text-white/40 border border-white/10",
};

const scriptSourceLabel: Record<string, string> = {
  "": "未生成",
  "local-rules": "本地规则",
  llm: "大模型",
  "local-fallback": "本地兜底",
};

const digitalHumanProviderLabel: Record<DigitalHumanProvider, string> = {
  placeholder: "占位测试",
  "musetalk-cli": "MuseTalk 本地",
  "http-api": "HTTP 数字人 API",
};

const sceneRoleLabel: Record<string, string> = {
  hook: "开场钩子",
  pain: "痛点",
  solution: "方案",
  proof: "证明",
  cta: "转化",
};

const sceneLayoutLabel: Record<string, string> = {
  full_dh: "全屏数字人",
  dh_top_broll_bottom: "上人下素材",
  broll_top_dh_bottom: "上素材下人",
  full_broll: "全屏素材",
};

function formatDuration(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ips, setIps] = useState<IP[]>(seedIps);
  const [templates, setTemplates] = useState<Template[]>(seedTemplates);
  const [selectedIP, setSelectedIP] = useState<IP>(seedIps[0]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(seedTemplates[0]);
  const [brandDraft, setBrandDraft] = useState<IP>(seedIps[0]);
  const [templateDraft, setTemplateDraft] = useState<Template>(seedTemplates[0]);
  const [llmConfig, setLlmConfig] = useState<PublicLlmConfig>(defaultLlmConfig);
  const [llmDraft, setLlmDraft] = useState<LlmConfigDraft>({ ...defaultLlmConfig, apiKey: "" });
  const [digitalHumanConfig, setDigitalHumanConfig] = useState<PublicDigitalHumanConfig>(defaultDigitalHumanConfig);
  const [digitalHumanDraft, setDigitalHumanDraft] = useState<DigitalHumanConfigDraft>({
    ...defaultDigitalHumanConfig,
    apiKey: "",
  });
  const [showSystemSettings, setShowSystemSettings] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["store", "product", "avatar"]);
  const [assets, setAssets] = useState<Asset[]>(seedAssets);
  const [targetPlatform, setTargetPlatform] = useState(platforms[0]);
  const [copyMode, setCopyMode] = useState(copyModes[0].id);
  const [count, setCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [scriptSource, setScriptSource] = useState("");
  const [scriptPreview, setScriptPreview] = useState<GeneratedScript | null>(null);
  const [selectingAssets, setSelectingAssets] = useState(false);
  const [selectionPreview, setSelectionPreview] = useState<AssetSelectionPreview | null>(null);
  const [ttsGenerating, setTtsGenerating] = useState(false);
  const [ttsPreview, setTtsPreview] = useState<TtsPreview | null>(null);
  const [digitalHumanGenerating, setDigitalHumanGenerating] = useState(false);
  const [digitalHumanPreview, setDigitalHumanPreview] = useState<DigitalHumanPreview | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [status, setStatus] = useState("待生成");
  const [currentTaskId, setCurrentTaskId] = useState("");
  const [retryingTaskId, setRetryingTaskId] = useState("");
  const [renderTasks, setRenderTasks] = useState<RenderTask[]>([]);
  const [resultUrl, setResultUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  const loadRenderTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/render-tasks");
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as { tasks?: RenderTask[] };
      const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      setRenderTasks(tasks);
      return tasks;
    } catch {
      setRenderTasks([]);
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/config")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load config"))))
      .then((payload: { brands?: IP[]; templates?: Template[] }) => {
        if (cancelled) return;
        const nextIps = Array.isArray(payload.brands) && payload.brands.length > 0 ? payload.brands : seedIps;
        const nextTemplates = Array.isArray(payload.templates) && payload.templates.length > 0
          ? payload.templates
          : seedTemplates;
        setIps(nextIps);
        setTemplates(nextTemplates);
        setSelectedIP(nextIps.find((ip) => ip.id === selectedIP.id) ?? nextIps[0]);
        setSelectedTemplate(
          nextTemplates.find((template) => template.id === selectedTemplate.id) ?? nextTemplates[0],
        );
      })
      .catch(() => {
        if (!cancelled) setStatus("配置加载失败，当前显示默认品牌和模板");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setBrandDraft(selectedIP);
  }, [selectedIP]);

  useEffect(() => {
    setTemplateDraft(selectedTemplate);
  }, [selectedTemplate]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/llm-config")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load LLM config"))))
      .then((payload: PublicLlmConfig) => {
        if (cancelled) return;
        setLlmConfig(payload);
        setLlmDraft({
          provider: payload.provider,
          baseUrl: payload.baseUrl,
          model: payload.model,
          temperature: payload.temperature,
          apiKey: "",
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("大模型接口配置加载失败，当前显示默认本地接口");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/digital-human-config")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load digital human config"))))
      .then((payload: PublicDigitalHumanConfig) => {
        if (cancelled) return;
        setDigitalHumanConfig(payload);
        setDigitalHumanDraft({
          provider: payload.provider,
          endpoint: payload.endpoint,
          avatarPath: payload.avatarPath,
          pythonPath: payload.pythonPath,
          apiKey: "",
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("数字人接入配置加载失败，当前显示占位测试模式");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/assets")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load assets"))))
      .then((payload: { assets?: Asset[] }) => {
        if (!cancelled && Array.isArray(payload.assets)) {
          setAssets([...seedAssets, ...payload.assets]);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("素材库加载失败，当前显示默认素材");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadRenderTasks();
  }, [loadRenderTasks]);

  const selectedAssetList = useMemo(
    () => assets.filter((asset) => selectedAssets.includes(asset.id)),
    [assets, selectedAssets],
  );

  const currentRenderTask = useMemo(
    () => renderTasks.find((task) => task.id === currentTaskId),
    [currentTaskId, renderTasks],
  );

  useEffect(() => {
    if (!currentTaskId) return;

    if (currentRenderTask?.status === "completed") {
      setStatus("生成完成");
      setResultUrl(currentRenderTask.resultUrl ?? "");
      setPreviewUrl(currentRenderTask.previewUrl ?? "");
      setCoverUrl(currentRenderTask.coverUrl ?? "");
      setGenerating(false);
      return;
    }

    if (currentRenderTask?.status === "failed") {
      setStatus(`失败: ${currentRenderTask.error || currentRenderTask.stage}`);
      setGenerating(false);
      return;
    }

    let cancelled = false;
    const syncCurrentTask = async () => {
      const tasks = await loadRenderTasks();
      if (cancelled) return;

      const task = tasks.find((item) => item.id === currentTaskId);
      if (!task) return;

      if (task.status === "completed") {
        setStatus("生成完成");
        setResultUrl(task.resultUrl ?? "");
        setPreviewUrl(task.previewUrl ?? "");
        setCoverUrl(task.coverUrl ?? "");
        setGenerating(false);
        return;
      }

      if (task.status === "failed") {
        setStatus(`失败: ${task.error || task.stage}`);
        setGenerating(false);
        return;
      }

      setStatus(task.stage || "后台渲染中...");
      setGenerating(true);
    };

    void syncCurrentTask();
    const timer = window.setInterval(() => {
      void syncCurrentTask();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    currentRenderTask?.coverUrl,
    currentRenderTask?.error,
    currentRenderTask?.previewUrl,
    currentRenderTask?.resultUrl,
    currentRenderTask?.stage,
    currentRenderTask?.status,
    currentTaskId,
    loadRenderTasks,
  ]);

  const videoPlanScenesById = useMemo(
    () => new Map((scriptPreview?.videoPlan?.scenes ?? []).map((scene) => [scene.id, scene])),
    [scriptPreview],
  );

  const activeStepIndex = useMemo(() => {
    if (!generating) return -1;
    const index = pipeline.findIndex((step) => status.includes(step.name.slice(0, 2)));
    return index >= 0 ? index : 2;
  }, [generating, status]);

  const toggleAsset = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    if (asset?.status === "disabled") return;

    setSelectedAssets((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    );
  };

  const openAssetUploader = () => {
    fileInputRef.current?.click();
  };

  const handleAssetUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    setStatus("正在上传素材并自动打标签...");

    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);

      const res = await fetch("/api/assets", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());

      const payload: { assets?: Asset[] } = await res.json();
      const createdAssets = Array.isArray(payload.assets) ? payload.assets : [];

      setAssets((current) => [...current, ...createdAssets]);
      setSelectedAssets((current) => Array.from(new Set([...current, ...createdAssets.map((asset) => asset.id)])));
      setStatus(`已入库 ${createdAssets.length} 个素材，自动标签完成，等待复核`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("素材上传失败: " + message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const updateAssetState = (asset: Asset) => {
    setAssets((current) => current.map((item) => (item.id === asset.id ? asset : item)));
  };

  const patchAsset = async (asset: Asset, patch: Partial<Pick<Asset, "status" | "tags">>) => {
    const optimisticAsset = { ...asset, ...patch };
    updateAssetState(optimisticAsset);

    if (!asset.uploadedAt) return;

    try {
      const res = await fetch("/api/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id, ...patch }),
      });
      if (!res.ok) throw new Error(await res.text());
      const payload: { asset?: Asset } = await res.json();
      if (payload.asset) updateAssetState(payload.asset);
    } catch (error: unknown) {
      updateAssetState(asset);
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("素材更新失败: " + message);
    }
  };

  const startEditingTags = (asset: Asset) => {
    setEditingAssetId(asset.id);
    setTagDraft(asset.tags.join("，"));
  };

  const saveTags = async (asset: Asset) => {
    const tags = tagDraft
      .split(/[,\s，、]+/u)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);

    await patchAsset(asset, { tags });
    setEditingAssetId(null);
    setStatus(`已更新「${asset.name}」标签`);
  };

  const toggleAssetEnabled = async (asset: Asset) => {
    const nextStatus = asset.status === "disabled" ? "review" : "disabled";
    if (nextStatus === "disabled") {
      setSelectedAssets((current) => current.filter((id) => id !== asset.id));
    }
    await patchAsset(asset, { status: nextStatus });
  };

  const saveConfigItem = async (kind: "brand" | "template", item: IP | Template) => {
    const res = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, item }),
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as { brands?: IP[]; templates?: Template[] };
  };

  const saveBrandConfig = async () => {
    try {
      const payload = await saveConfigItem("brand", brandDraft);
      const nextIps = Array.isArray(payload.brands) ? payload.brands : ips;
      setIps(nextIps);
      const nextBrand = nextIps.find((ip) => ip.id === brandDraft.id) ?? brandDraft;
      setSelectedIP(nextBrand);
      setStatus(`已保存「${nextBrand.name}」品牌配置`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("品牌配置保存失败: " + message);
    }
  };

  const saveTemplateConfig = async () => {
    try {
      const payload = await saveConfigItem("template", templateDraft);
      const nextTemplates = Array.isArray(payload.templates) ? payload.templates : templates;
      setTemplates(nextTemplates);
      const nextTemplate = nextTemplates.find((template) => template.id === templateDraft.id) ?? templateDraft;
      setSelectedTemplate(nextTemplate);
      setStatus(`已保存「${nextTemplate.name}」模板配置`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("模板配置保存失败: " + message);
    }
  };

  const saveLlmConfig = async () => {
    try {
      const payload: Partial<LlmConfigDraft> = {
        provider: llmDraft.provider,
        baseUrl: llmDraft.baseUrl,
        model: llmDraft.model,
        temperature: Number(llmDraft.temperature),
      };
      if (llmDraft.apiKey.trim()) payload.apiKey = llmDraft.apiKey.trim();

      const res = await fetch("/api/llm-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      const nextConfig = (await res.json()) as PublicLlmConfig;
      setLlmConfig(nextConfig);
      setLlmDraft({
        provider: nextConfig.provider,
        baseUrl: nextConfig.baseUrl,
        model: nextConfig.model,
        temperature: nextConfig.temperature,
        apiKey: "",
      });
      setStatus(`已保存大模型接口：${nextConfig.model}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("大模型接口保存失败: " + message);
    }
  };

  const saveDigitalHumanConfig = async (clearApiKey = false) => {
    try {
      const payload: Record<string, unknown> = {
        provider: digitalHumanDraft.provider,
        endpoint: digitalHumanDraft.endpoint,
        avatarPath: digitalHumanDraft.avatarPath,
        pythonPath: digitalHumanDraft.pythonPath,
      };
      if (digitalHumanDraft.apiKey.trim()) payload.apiKey = digitalHumanDraft.apiKey.trim();
      if (clearApiKey) payload.clearApiKey = true;

      const res = await fetch("/api/digital-human-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      const nextConfig = (await res.json()) as PublicDigitalHumanConfig;
      setDigitalHumanConfig(nextConfig);
      setDigitalHumanDraft({
        provider: nextConfig.provider,
        endpoint: nextConfig.endpoint,
        avatarPath: nextConfig.avatarPath,
        pythonPath: nextConfig.pythonPath,
        apiKey: "",
      });
      setStatus(`已保存数字人接入：${digitalHumanProviderLabel[nextConfig.provider]}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("数字人接入保存失败: " + message);
    }
  };

  const handleGenerateScript = async () => {
    setScriptGenerating(true);
    setStatus("正在生成结构化分镜脚本...");

    try {
      const shouldUseLlm = llmConfig.apiKeySet
        || llmConfig.provider !== defaultLlmConfig.provider
        || llmConfig.baseUrl !== defaultLlmConfig.baseUrl
        || llmConfig.model !== defaultLlmConfig.model;
      const assetTags = selectedAssetList.flatMap((asset) => asset.tags);
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: selectedIP,
          template: selectedTemplate,
          targetPlatform,
          copyMode,
          assetTags,
          useLlm: shouldUseLlm,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      const payload = (await res.json()) as {
        source: string;
        script: GeneratedScript;
        llmError?: string;
      };
      setScriptPreview(payload.script);
      setScriptSource(payload.source);
      setSelectionPreview(null);
      setTtsPreview(null);
      setDigitalHumanPreview(null);
      setStatus(payload.llmError ? `脚本已生成，本地兜底：${payload.llmError}` : "结构化分镜脚本已生成");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("脚本生成失败: " + message);
    } finally {
      setScriptGenerating(false);
    }
  };

  const handleAutoSelectAssets = async () => {
    if (!scriptPreview) {
      setStatus("请先生成结构化分镜脚本");
      return;
    }

    setSelectingAssets(true);
    setStatus("正在按脚本标签自动选材...");

    try {
      const res = await fetch("/api/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: scriptPreview,
          assets,
          targetPlatform,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      const payload = (await res.json()) as AssetSelectionPreview;
      setSelectionPreview(payload);
      if (payload.selectedAssetIds.length > 0) {
        setSelectedAssets(payload.selectedAssetIds);
      }
      setStatus(`自动选材完成：${payload.coverage.filledSlots}/${payload.coverage.slots} 个素材位已匹配`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("自动选材失败: " + message);
    } finally {
      setSelectingAssets(false);
    }
  };

  const handleGenerateTts = async () => {
    if (!scriptPreview) {
      setStatus("请先生成结构化分镜脚本");
      return;
    }

    setTtsGenerating(true);
    setStatus("正在本地合成语音...");

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: scriptPreview,
          provider: "auto",
          voiceId: "中文女",
          speed: 1,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      const payload = (await res.json()) as TtsPreview;
      setTtsPreview(payload);
      setDigitalHumanPreview(null);
      setStatus(`语音合成完成：${payload.clips.length} 段，${formatDuration(payload.totalDurationMs)}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("语音合成失败: " + message);
    } finally {
      setTtsGenerating(false);
    }
  };

  const handleGenerateDigitalHuman = async () => {
    if (!scriptPreview || !ttsPreview) {
      setStatus("请先生成脚本和语音");
      return;
    }

    setDigitalHumanGenerating(true);
    setStatus("正在生成数字人片段...");

    try {
      const res = await fetch("/api/digital-human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: scriptPreview,
          tts: ttsPreview,
          provider: "auto",
          alpha: true,
          chromaKey: {
            color: "#00FF00",
            similarity: 0.18,
            blend: 0.08,
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      const payload = (await res.json()) as DigitalHumanPreview;
      const alphaCount = payload.clips.filter((clip) => clip.alpha).length;
      setDigitalHumanPreview(payload);
      setStatus(`数字人片段完成：${payload.clips.length} 段，透明通道 ${alphaCount} 段`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("数字人生成失败: " + message);
    } finally {
      setDigitalHumanGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!scriptPreview || !ttsPreview || !digitalHumanPreview) {
      setStatus("请先完成分镜脚本、语音合成和数字人片段");
      return;
    }

    setGenerating(true);
    setStatus("正在组装成片 Timeline...");
    setCurrentTaskId("");
    setResultUrl("");
    setPreviewUrl("");
    setCoverUrl("");

    try {
      const res = await fetch("/api/render-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ipId: selectedIP.id,
          brand: selectedIP,
          template: selectedTemplate,
          script: scriptPreview,
          selection: selectionPreview,
          tts: ttsPreview,
          digitalHuman: digitalHumanPreview,
          templateId: selectedTemplate.id,
          assetIds: selectedAssets,
          targetPlatform,
          copyMode,
          count,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const payload = (await res.json()) as {
        task?: RenderTask;
        tasks?: RenderTask[];
        taskId?: string;
        batchCount?: number;
        autoStarted?: boolean;
      };
      const submittedTasks = Array.isArray(payload.tasks) && payload.tasks.length > 0
        ? payload.tasks
        : payload.task
          ? [payload.task]
          : [];
      const submittedTaskId = submittedTasks[submittedTasks.length - 1]?.id ?? payload.taskId;
      if (!submittedTaskId) throw new Error("Render task id missing");

      if (submittedTasks.length > 0) {
        const submittedIds = new Set(submittedTasks.map((task) => task.id));
        setRenderTasks((tasks) => [...submittedTasks, ...tasks.filter((task) => !submittedIds.has(task.id))]);
      }
      setCurrentTaskId(submittedTaskId);
      setStatus(
        payload.autoStarted === false
          ? submittedTasks.length > 1
            ? `已提交 ${submittedTasks.length} 个任务，等待 Render Worker 接管...`
            : "任务已提交，等待 Render Worker 接管..."
          : submittedTasks.length > 1
            ? `已提交 ${submittedTasks.length} 个后台任务，按队列渲染中...`
            : "任务已提交，后台渲染中...",
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("失败: " + message);
      setGenerating(false);
    } finally {
      await loadRenderTasks();
    }
  };

  const handleRetryRenderTask = async (taskId: string) => {
    setRetryingTaskId(taskId);
    setGenerating(true);
    setCurrentTaskId(taskId);
    setResultUrl("");
    setPreviewUrl("");
    setCoverUrl("");
    setStatus("正在重新提交后台任务...");

    try {
      const res = await fetch(`/api/render-tasks/${encodeURIComponent(taskId)}/retry`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());

      const payload = (await res.json()) as { task?: RenderTask; taskId?: string };
      if (payload.task) {
        setRenderTasks((tasks) => [payload.task as RenderTask, ...tasks.filter((task) => task.id !== taskId)]);
      }
      setCurrentTaskId(payload.taskId ?? taskId);
      setStatus("任务已重新提交，后台渲染中...");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("重试失败: " + message);
      setGenerating(false);
    } finally {
      setRetryingTaskId("");
      await loadRenderTasks();
    }
  };

  const cardBase = "glass rounded-2xl p-5";
  const optionBase =
    "min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left card-hover";
  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition focus:border-[#ff3b5c]/60 focus:bg-white/[0.06]";
  const availableAssetCount = assets.filter((asset) => asset.status !== "disabled").length;
  const digitalHumanConnectionStatus =
    digitalHumanConfig.provider === "http-api"
      ? digitalHumanConfig.endpoint
        ? "生产 API 已配置"
        : "待填写生产 API"
      : digitalHumanConfig.provider === "musetalk-cli"
        ? "本地 MuseTalk"
        : "占位测试";
  const storyboardScenes = scriptPreview?.videoPlan?.scenes ?? scriptPreview?.scenes ?? [];

  return (
    <main className="relative z-10 min-h-screen overflow-x-hidden text-[var(--color-ink)]">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#06070d]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff3b5c] to-[#a855f7] shadow-lg shadow-[#ff3b5c]/30">
              <MonitorCog className="h-5 w-5 text-white" />
              <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-white/90" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-semibold tracking-tight gradient-text">Cutix</div>
              <div className="text-xs text-white/50">商业 IP 视频生产控制台</div>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 pulse-dot" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Worker 空闲 <span className="font-semibold text-white">3</span>
              <span className="text-white/30">/</span>
              队列 <span className="font-semibold text-white">0</span>
            </div>
            <button
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                showSystemSettings
                  ? "border-[#ff3b5c]/40 bg-[#ff3b5c]/10 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.07] hover:text-white"
              }`}
              onClick={() => setShowSystemSettings((current) => !current)}
              type="button"
            >
              <Settings className="h-4 w-4" />
              系统设置
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={uploading}
              onClick={openAssetUploader}
              type="button"
            >
              <UploadCloud className="h-4 w-4" />
              {uploading ? "上传中" : "导入素材"}
            </button>
          </div>
        </div>
      </header>
      <input
        ref={fileInputRef}
        accept="video/*,image/*,audio/*"
        className="hidden"
        multiple
        onChange={handleAssetUpload}
        type="file"
      />

      {showSystemSettings && (
        <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className={cardBase}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/40">System</div>
                  <h2 className="mt-1 text-base font-semibold text-white">大模型接口</h2>
                  <p className="mt-1 text-xs text-white/50">用于文案、分镜和画面编排，可接本地兼容接口。</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  llmConfig.apiKeySet
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 bg-white/5 text-white/50"
                }`}
                >
                  {llmConfig.apiKeySet ? `Key ${llmConfig.apiKeyPreview}` : "本地可留空"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="block text-xs font-medium text-white/60">
                  接口类型
                  <select
                    className={fieldClass}
                    onChange={(event) => setLlmDraft({ ...llmDraft, provider: event.target.value as LlmProvider })}
                    value={llmDraft.provider}
                  >
                    <option className="bg-[#0a0b14]" value="openai-compatible">OpenAI Compatible</option>
                    <option className="bg-[#0a0b14]" value="ollama">Ollama</option>
                    <option className="bg-[#0a0b14]" value="vllm">vLLM</option>
                    <option className="bg-[#0a0b14]" value="custom">自定义</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-white/60">
                  模型名
                  <input
                    className={fieldClass}
                    onChange={(event) => setLlmDraft({ ...llmDraft, model: event.target.value })}
                    placeholder="qwen2.5:7b"
                    value={llmDraft.model}
                  />
                </label>
                <label className="block text-xs font-medium text-white/60 md:col-span-2">
                  Base URL
                  <input
                    className={fieldClass}
                    onChange={(event) => setLlmDraft({ ...llmDraft, baseUrl: event.target.value })}
                    placeholder="http://127.0.0.1:11434/v1"
                    value={llmDraft.baseUrl}
                  />
                </label>
                <label className="block text-xs font-medium text-white/60">
                  API Key
                  <input
                    className={fieldClass}
                    onChange={(event) => setLlmDraft({ ...llmDraft, apiKey: event.target.value })}
                    placeholder={llmConfig.apiKeySet ? `已保存 ${llmConfig.apiKeyPreview}，留空保留` : "本地模型可留空"}
                    type="password"
                    value={llmDraft.apiKey}
                  />
                </label>
                <label className="block text-xs font-medium text-white/60">
                  Temperature
                  <input
                    className={fieldClass}
                    max={2}
                    min={0}
                    onChange={(event) => setLlmDraft({ ...llmDraft, temperature: Number(event.target.value) })}
                    step={0.1}
                    type="number"
                    value={llmDraft.temperature}
                  />
                </label>
              </div>
              <button
                className="btn-primary mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white"
                onClick={saveLlmConfig}
                type="button"
              >
                保存大模型接口
              </button>
            </section>

            <section className={cardBase}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/40">Avatar</div>
                  <h2 className="mt-1 text-base font-semibold text-white">数字人接入</h2>
                  <p className="mt-1 text-xs text-white/50">生产环境建议接 HTTP 数字人服务，MVP 可接本地 MuseTalk。</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  digitalHumanConfig.provider === "placeholder"
                    ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                    : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                }`}
                >
                  {digitalHumanConnectionStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="block text-xs font-medium text-white/60">
                  接入方式
                  <select
                    className={fieldClass}
                    onChange={(event) =>
                      setDigitalHumanDraft({
                        ...digitalHumanDraft,
                        provider: event.target.value as DigitalHumanProvider,
                      })}
                    value={digitalHumanDraft.provider}
                  >
                    <option className="bg-[#0a0b14]" value="http-api">HTTP 数字人 API</option>
                    <option className="bg-[#0a0b14]" value="musetalk-cli">MuseTalk 本地 CLI</option>
                    <option className="bg-[#0a0b14]" value="placeholder">占位测试</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-white/60">
                  Python
                  <input
                    className={fieldClass}
                    onChange={(event) => setDigitalHumanDraft({ ...digitalHumanDraft, pythonPath: event.target.value })}
                    placeholder="python"
                    value={digitalHumanDraft.pythonPath}
                  />
                </label>
                <label className="block text-xs font-medium text-white/60 md:col-span-2">
                  HTTP Endpoint
                  <input
                    className={fieldClass}
                    onChange={(event) => setDigitalHumanDraft({ ...digitalHumanDraft, endpoint: event.target.value })}
                    placeholder="http://127.0.0.1:7860/generate"
                    value={digitalHumanDraft.endpoint}
                  />
                </label>
                <label className="block text-xs font-medium text-white/60 md:col-span-2">
                  数字人参考素材路径
                  <input
                    className={fieldClass}
                    onChange={(event) => setDigitalHumanDraft({ ...digitalHumanDraft, avatarPath: event.target.value })}
                    placeholder="C:\\avatars\\wang.mp4"
                    value={digitalHumanDraft.avatarPath}
                  />
                </label>
                <label className="block text-xs font-medium text-white/60 md:col-span-2">
                  API Key
                  <input
                    className={fieldClass}
                    onChange={(event) => setDigitalHumanDraft({ ...digitalHumanDraft, apiKey: event.target.value })}
                    placeholder={
                      digitalHumanConfig.apiKeySet
                        ? `已保存 ${digitalHumanConfig.apiKeyPreview}，留空保留`
                        : "没有鉴权可留空"
                    }
                    type="password"
                    value={digitalHumanDraft.apiKey}
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  className="btn-primary inline-flex flex-1 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white"
                  onClick={() => saveDigitalHumanConfig()}
                  type="button"
                >
                  保存数字人接入
                </button>
                {digitalHumanConfig.apiKeySet && (
                  <button
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/[0.07] hover:text-white"
                    onClick={() => saveDigitalHumanConfig(true)}
                    type="button"
                  >
                    清除 Key
                  </button>
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)_380px]">
        <aside className="space-y-5">
          <section className={cardBase}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">本次生成</h2>
                <p className="mt-1 text-xs text-white/50">IP、平台、批量与文案策略</p>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-[#ff3b5c]/20 to-[#a855f7]/20 p-2">
                <Activity className="h-4 w-4 text-[#ff3b5c]" />
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-white/60">
                目标平台
                <select
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#ff3b5c]/60 focus:bg-white/[0.06] transition"
                  onChange={(e) => setTargetPlatform(e.target.value)}
                  value={targetPlatform}
                >
                  {platforms.map((platform) => (
                    <option key={platform} className="bg-[#0a0b14]">{platform}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-white/60">
                批量数量
                <input
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#ff3b5c]/60 focus:bg-white/[0.06] transition"
                  max={50}
                  min={1}
                  onChange={(e) => setCount(Number(e.target.value))}
                  type="number"
                  value={count}
                />
              </label>
            </div>

            <div className="mt-5 border-t border-white/5 pt-4">
              <div className="mb-2 text-xs font-semibold text-white/80">文案策略</div>
              <div className="grid grid-cols-1 gap-2">
                {copyModes.map((mode) => {
                  const selected = copyMode === mode.id;
                  return (
                    <button
                      className={`rounded-xl border p-3 text-left card-hover ${
                        selected ? "ring-selected" : "border-white/10 bg-white/[0.03]"
                      }`}
                      key={mode.id}
                      onClick={() => setCopyMode(mode.id)}
                      type="button"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <WandSparkles className={`h-4 w-4 ${selected ? "text-[#ff3b5c]" : "text-white/50"}`} />
                        {mode.label}
                      </div>
                      <div className="mt-1 text-xs text-white/50">{mode.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className={cardBase}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">自动工作流</h2>
                <p className="mt-1 text-xs text-white/50">文案、分镜、选材、数字人和成片按隐藏流程执行。</p>
              </div>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/[0.07] hover:text-white"
                onClick={() => setShowSystemSettings(true)}
                type="button"
              >
                <Settings className="h-3.5 w-3.5" />
                设置
              </button>
            </div>

            <div className="space-y-2">
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-white/55">文案与编排</span>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100">
                    自动
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-white">生成结构化分镜，再决定每段画面布局</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-white/55">数字人</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    digitalHumanConfig.provider === "placeholder"
                      ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                      : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                  }`}
                  >
                    {digitalHumanConnectionStatus}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {digitalHumanProviderLabel[digitalHumanConfig.provider]}
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-white/55">素材库</span>
                  <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[11px] text-emerald-100">
                    {availableAssetCount} 个可用
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-white">已入库素材会自动按分镜标签匹配</div>
              </div>
            </div>
          </section>

          <section className={cardBase}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">生产链路</h2>
              <span className="rounded-full border border-[#ff3b5c]/30 bg-[#ff3b5c]/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#ff3b5c]">
                MVP
              </span>
            </div>
            <div className="relative space-y-2">
              {pipeline.map((step, index) => {
                const StepIcon = step.icon;
                const active = index === activeStepIndex;
                const complete = generating && activeStepIndex > index;
                return (
                  <div
                    className={`relative rounded-xl border p-3 transition ${
                      active
                        ? "border-[#ff3b5c]/40 bg-gradient-to-r from-[#ff3b5c]/10 to-[#a855f7]/5"
                        : complete
                          ? "border-emerald-400/20 bg-emerald-400/5"
                          : "border-white/8 bg-white/[0.02]"
                    }`}
                    key={step.name}
                  >
                    {active && (
                      <div className="absolute inset-0 rounded-xl shimmer opacity-40 pointer-events-none" />
                    )}
                    <div className="relative flex items-start gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          active
                            ? "bg-gradient-to-br from-[#ff3b5c] to-[#a855f7] text-white shadow-lg shadow-[#ff3b5c]/40"
                            : complete
                              ? "bg-emerald-400/20 text-emerald-300"
                              : "bg-white/5 text-white/40"
                        }`}
                      >
                        <StepIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{step.name}</div>
                        <div className="mt-0.5 text-xs text-white/50">{step.detail}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="min-w-0 space-y-5">
          <section className={cardBase}>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-white/40">Brand</div>
                <h2 className="mt-1 text-xl font-semibold text-white">IP / 品牌</h2>
                <p className="mt-1 text-sm text-white/50">品牌配置会影响文案、字幕、模板色彩和默认 BGM。</p>
              </div>
              <span
                className="inline-flex w-fit max-w-full rounded-full px-3 py-1 text-xs font-semibold text-white shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${selectedIP.color}, ${selectedIP.color}aa)`,
                  boxShadow: `0 8px 24px -8px ${selectedIP.color}80`,
                }}
              >
                {selectedIP.industry}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {ips.map((ip) => {
                const selected = selectedIP.id === ip.id;
                return (
                  <button
                    className={`${optionBase} ${selected ? "ring-selected" : ""}`}
                    key={ip.id}
                    onClick={() => setSelectedIP(ip)}
                    type="button"
                  >
                    <div
                      className="mb-3 h-1.5 w-14 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${ip.color}, ${ip.color}55)` }}
                    />
                    <div className="truncate font-semibold text-white">{ip.name}</div>
                    <div className="mt-1 text-xs text-white/50">{ip.tone}</div>
                    <div className="mt-3 text-xs leading-5 text-white/70">{ip.promise}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">品牌配置</div>
                  <div className="mt-0.5 text-xs text-white/45">保存后会写入本地配置，后续文案和模板都从这里读取。</div>
                </div>
                <button
                  className="btn-primary inline-flex w-fit items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  onClick={saveBrandConfig}
                  type="button"
                >
                  保存品牌
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs font-medium text-white/60">
                  品牌名
                  <input
                    className={fieldClass}
                    onChange={(event) => setBrandDraft({ ...brandDraft, name: event.target.value })}
                    value={brandDraft.name}
                  />
                </label>
                <label className="text-xs font-medium text-white/60">
                  行业/用途
                  <input
                    className={fieldClass}
                    onChange={(event) => setBrandDraft({ ...brandDraft, industry: event.target.value })}
                    value={brandDraft.industry}
                  />
                </label>
                <label className="text-xs font-medium text-white/60">
                  口吻
                  <input
                    className={fieldClass}
                    onChange={(event) => setBrandDraft({ ...brandDraft, tone: event.target.value })}
                    value={brandDraft.tone}
                  />
                </label>
                <label className="text-xs font-medium text-white/60">
                  默认 BGM
                  <input
                    className={fieldClass}
                    onChange={(event) => setBrandDraft({ ...brandDraft, defaultBgm: event.target.value })}
                    value={brandDraft.defaultBgm}
                  />
                </label>
                <label className="text-xs font-medium text-white/60">
                  品牌色
                  <div className="mt-1.5 flex gap-2">
                    <input
                      className="h-10 w-12 rounded-lg border border-white/10 bg-white/[0.04] p-1"
                      onChange={(event) => setBrandDraft({ ...brandDraft, color: event.target.value })}
                      type="color"
                      value={brandDraft.color}
                    />
                    <input
                      className={fieldClass.replace("mt-1.5 ", "")}
                      onChange={(event) => setBrandDraft({ ...brandDraft, color: event.target.value })}
                      value={brandDraft.color}
                    />
                  </div>
                </label>
                <label className="text-xs font-medium text-white/60 md:col-span-2">
                  核心表达
                  <textarea
                    className={`${fieldClass} min-h-20 resize-none`}
                    onChange={(event) => setBrandDraft({ ...brandDraft, promise: event.target.value })}
                    value={brandDraft.promise}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className={cardBase}>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-white/40">Library</div>
                <h2 className="mt-1 text-xl font-semibold text-white">素材库</h2>
                <p className="mt-1 text-sm text-white/50">接入自动标签结果，按标签和 IP 规则匹配素材。</p>
              </div>
              <button
                className="btn-primary inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
                disabled={uploading}
                onClick={openAssetUploader}
                type="button"
              >
                <UploadCloud className="h-4 w-4" />
                {uploading ? "上传中" : "上传素材"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {assets.map((asset) => {
                const selected = selectedAssets.includes(asset.id);
                const editing = editingAssetId === asset.id;
                return (
                  <div
                    className={`${optionBase} ${selected ? "ring-selected" : ""}`}
                    key={asset.id}
                  >
                    <button className="w-full text-left" onClick={() => toggleAsset(asset.id)} type="button">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl text-white shadow-lg"
                          style={{ background: `linear-gradient(135deg, ${asset.color}, #1a1a2e)` }}
                        >
                          {asset.thumbnailUrl ? (
                            <img alt="" className="h-full w-full object-cover" src={asset.thumbnailUrl} />
                          ) : (
                            <>
                              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                              {asset.type === "avatar" ? (
                                <UserRound className="relative h-6 w-6" />
                              ) : (
                                <Clapperboard className="relative h-6 w-6" />
                              )}
                            </>
                          )}
                          {asset.status === "disabled" && <div className="absolute inset-0 bg-black/60" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-white">{asset.name}</div>
                              <div className="mt-0.5 text-xs text-white/45">{asset.source}</div>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle[asset.status]}`}>
                              {statusLabel[asset.status]}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-white/50">
                            {typeLabel[asset.type]} · {asset.orientation} · {asset.duration}
                            <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-white/70">
                              匹配 {asset.matchScore}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {asset.tags.map((tag) => (
                              <span
                                className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60"
                                key={tag}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>

                    {editing ? (
                      <div className="mt-3 border-t border-white/8 pt-3">
                        <input
                          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-[#ff3b5c]/60"
                          onChange={(event) => setTagDraft(event.target.value)}
                          placeholder="用逗号分隔标签"
                          value={tagDraft}
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            className="rounded-lg bg-[#ff3b5c] px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => saveTags(asset)}
                            type="button"
                          >
                            保存标签
                          </button>
                          <button
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70"
                            onClick={() => setEditingAssetId(null)}
                            type="button"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3">
                        <button
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.06]"
                          onClick={() => startEditingTags(asset)}
                          type="button"
                        >
                          编辑标签
                        </button>
                        <button
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.06]"
                          onClick={() => toggleAssetEnabled(asset)}
                          type="button"
                        >
                          {asset.status === "disabled" ? "启用素材" : "禁用素材"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className={cardBase}>
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/40">Template</div>
                <h2 className="mt-1 text-xl font-semibold text-white">模板</h2>
                <p className="mt-1 text-sm text-white/50">模板提供风格约束，实际画面结构由分镜编排决定。</p>
              </div>
              <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                时长 {selectedTemplate.duration}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {templates.map((template) => {
                const selected = selectedTemplate.id === template.id;
                return (
                  <button
                    className={`${optionBase} ${selected ? "ring-selected" : ""}`}
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    type="button"
                  >
                    <div
                      className="mb-3 h-1.5 w-12 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${template.accent}, ${template.accent}55)` }}
                    />
                    <div className="text-[10px] uppercase tracking-wider text-white/40">{template.category}</div>
                    <div className="mt-1 font-semibold text-white">{template.name}</div>
                    <div className="mt-2 text-xs text-white/50">{template.layout}</div>
                    <div className="mt-3 text-xs text-white/70">{template.bestFor}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">模板配置</div>
                  <div className="mt-0.5 text-xs text-white/45">保存后会影响预览和后续 Remotion Timeline 生成。</div>
                </div>
                <button
                  className="btn-primary inline-flex w-fit items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  onClick={saveTemplateConfig}
                  type="button"
                >
                  保存模板
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs font-medium text-white/60">
                  模板名
                  <input
                    className={fieldClass}
                    onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })}
                    value={templateDraft.name}
                  />
                </label>
                <label className="text-xs font-medium text-white/60">
                  分类
                  <input
                    className={fieldClass}
                    onChange={(event) => setTemplateDraft({ ...templateDraft, category: event.target.value })}
                    value={templateDraft.category}
                  />
                </label>
                <label className="text-xs font-medium text-white/60">
                  时长
                  <input
                    className={fieldClass}
                    onChange={(event) => setTemplateDraft({ ...templateDraft, duration: event.target.value })}
                    value={templateDraft.duration}
                  />
                </label>
                <label className="text-xs font-medium text-white/60">
                  强调色
                  <div className="mt-1.5 flex gap-2">
                    <input
                      className="h-10 w-12 rounded-lg border border-white/10 bg-white/[0.04] p-1"
                      onChange={(event) => setTemplateDraft({ ...templateDraft, accent: event.target.value })}
                      type="color"
                      value={templateDraft.accent}
                    />
                    <input
                      className={fieldClass.replace("mt-1.5 ", "")}
                      onChange={(event) => setTemplateDraft({ ...templateDraft, accent: event.target.value })}
                      value={templateDraft.accent}
                    />
                  </div>
                </label>
                <label className="text-xs font-medium text-white/60 md:col-span-2">
                  画面结构
                  <input
                    className={fieldClass}
                    onChange={(event) => setTemplateDraft({ ...templateDraft, layout: event.target.value })}
                    value={templateDraft.layout}
                  />
                </label>
                <label className="text-xs font-medium text-white/60 md:col-span-2">
                  适用场景
                  <textarea
                    className={`${fieldClass} min-h-20 resize-none`}
                    onChange={(event) => setTemplateDraft({ ...templateDraft, bestFor: event.target.value })}
                    value={templateDraft.bestFor}
                  />
                </label>
              </div>
            </div>
          </section>
        </section>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <section className={cardBase}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/40">Preview</div>
                <h2 className="mt-1 text-base font-semibold text-white">分镜编排预览</h2>
                <p className="mt-0.5 text-xs text-white/50">
                  {storyboardScenes.length > 0 ? `${storyboardScenes.length} 个分镜` : selectedTemplate.name}
                </p>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                9:16
              </span>
            </div>

            <div className="relative mx-auto aspect-[9/16] w-full max-w-[290px] overflow-hidden rounded-2xl border border-white/10 bg-black text-white shadow-2xl shadow-black/60">
              {storyboardScenes.length > 0 ? (
                <div className="flex h-full flex-col">
                  <div className="flex min-h-0 flex-1 flex-col">
                    {storyboardScenes.slice(0, 5).map((scene, index) => {
                      const sceneAssets = selectedAssetList.length ? selectedAssetList : assets;
                      const asset = sceneAssets[index % sceneAssets.length];
                      const isFullDigitalHuman = scene.layout === "full_dh";
                      const isFullBroll = scene.layout === "full_broll";
                      const humanFirst = scene.layout !== "broll_top_dh_bottom";
                      const avatarBlock = (
                        <div
                          className="flex h-full items-center justify-center px-3 text-center"
                          style={{
                            background: `linear-gradient(180deg, ${selectedIP.color}, #111827)`,
                          }}
                        >
                          <div>
                            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10">
                              <UserRound className="h-6 w-6 text-white/90" />
                            </div>
                            <div className="text-[11px] font-semibold">{selectedIP.name}</div>
                          </div>
                        </div>
                      );
                      const brollBlock = (
                        <div
                          className="flex h-full items-center justify-center px-3 text-center text-[11px] font-semibold"
                          style={{
                            background: `linear-gradient(135deg, ${asset?.color ?? selectedIP.color}, #0f172a)`,
                          }}
                        >
                          {asset?.name ?? "素材位"}
                        </div>
                      );

                      return (
                        <div
                          className="relative min-h-[76px] overflow-hidden border-b border-white/10"
                          key={`${scene.id}-${index}`}
                          style={{ flex: Math.max(1, scene.durationSec) }}
                        >
                          <div className="absolute left-2 top-2 z-10 rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white/70 backdrop-blur">
                            {index + 1}. {sceneLayoutLabel[scene.layout] ?? scene.layout}
                          </div>
                          {isFullDigitalHuman ? (
                            avatarBlock
                          ) : isFullBroll ? (
                            brollBlock
                          ) : (
                            <div className="grid h-full grid-rows-2 gap-px bg-white/10">
                              {humanFirst ? avatarBlock : brollBlock}
                              {humanFirst ? brollBlock : avatarBlock}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex h-14 items-center justify-center bg-black/90 px-4 text-center text-xs font-medium leading-5">
                    {scriptPreview?.cta ?? selectedTemplate.name}
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <div
                    className="flex flex-1 items-center justify-center px-6 text-center"
                    style={{ background: `linear-gradient(180deg, ${selectedIP.color}, #0a0b14)` }}
                  >
                    <div>
                      <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-sm">
                        <WandSparkles className="h-10 w-10 text-white/90" />
                      </div>
                      <div className="text-sm font-semibold">等待分镜编排</div>
                      <div className="mt-2 text-xs text-white/70">{selectedTemplate.layout}</div>
                    </div>
                  </div>
                  <div className="flex h-14 items-center justify-center bg-black/90 px-4 text-center text-xs font-medium leading-5">
                    {selectedIP.name} · {targetPlatform}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={cardBase}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/40">Script</div>
                <h2 className="mt-1 text-base font-semibold text-white">脚本草案</h2>
                <p className="mt-0.5 text-xs text-white/50">
                  {selectedIP.name} · {selectedTemplate.name}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                {scriptSourceLabel[scriptSource] ?? scriptSource}
              </span>
            </div>

            <button
              className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={scriptGenerating}
              onClick={handleGenerateScript}
              type="button"
            >
              <WandSparkles className="h-4 w-4" />
              {scriptGenerating ? "生成中..." : "生成分镜脚本"}
            </button>

            {scriptPreview ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="text-sm font-semibold leading-5 text-white">{scriptPreview.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-white/60">
                    <span className="rounded-full bg-white/5 px-2 py-1">{scriptPreview.platform}</span>
                    <span className="rounded-full bg-white/5 px-2 py-1">{scriptPreview.scenes.length} 个分镜</span>
                    <span className="rounded-full bg-white/5 px-2 py-1">{scriptPreview.cta}</span>
                    {scriptPreview.videoPlan && (
                      <>
                        <span className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2 py-1 text-emerald-100">
                          编排已锁定
                        </span>
                        <span className="rounded-full bg-white/5 px-2 py-1">
                          {scriptPreview.videoPlan.totalDurationSec}s
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {scriptPreview.scenes.map((scene, index) => {
                    const planScene = videoPlanScenesById.get(scene.id);
                    const slotTags = (planScene?.materialSlots ?? []).flatMap((slot) => slot.tags).slice(0, 5);
                    return (
                      <div className="rounded-xl border border-white/8 bg-black/20 p-3" key={`${scene.id}-${index}`}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">
                            {index + 1}. {sceneRoleLabel[scene.role] ?? scene.role}
                          </span>
                          <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/50">
                            {scene.durationSec}s
                          </span>
                        </div>
                        <p className="text-xs leading-5 text-white/75">{scene.copy}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/55">
                            {sceneLayoutLabel[scene.layout] ?? scene.layout}
                          </span>
                          {scene.needsDigitalHuman && (
                            <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-2 py-0.5 text-[11px] text-fuchsia-200">
                              数字人
                            </span>
                          )}
                          {scene.visualTags.slice(0, 4).map((tag) => (
                            <span
                              className="rounded-full border border-cyan-300/15 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100"
                              key={tag}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        {planScene && (
                          <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.025] p-2.5">
                            <div className="text-[11px] font-semibold text-white/50">编排计划</div>
                            <div className="mt-1 text-xs leading-5 text-white/70">{planScene.visualGoal}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/50">
                                转场 {planScene.transition}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/50">
                                数字人 {planScene.digitalHuman.placement}
                              </span>
                              {slotTags.map((tag) => (
                                <span
                                  className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2 py-0.5 text-[11px] text-emerald-100"
                                  key={`${scene.id}-${tag}`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/45">
                暂无脚本草案
              </div>
            )}
          </section>

          <section className={cardBase}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/40">Matching</div>
                <h2 className="mt-1 text-base font-semibold text-white">选材方案</h2>
                <p className="mt-0.5 text-xs text-white/50">
                  {selectionPreview ? `${selectionPreview.coverage.filledSlots}/${selectionPreview.coverage.slots} 个素材位` : "等待脚本"}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                {selectionPreview ? `${selectionPreview.coverage.ratio}%` : "待匹配"}
              </span>
            </div>

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={selectingAssets || !scriptPreview}
              onClick={handleAutoSelectAssets}
              type="button"
            >
              <Tags className="h-4 w-4" />
              {selectingAssets ? "匹配中..." : "自动选材"}
            </button>

            {selectionPreview ? (
              <div className="mt-4 space-y-3">
                {selectionPreview.global.bgm ? (
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">BGM</span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
                        {selectionPreview.global.bgm.score} 分
                      </span>
                    </div>
                    <div className="text-xs text-white/70">{selectionPreview.global.bgm.name}</div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
                    {selectionPreview.global.warning}
                  </div>
                )}

                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {selectionPreview.selections.map((scene, index) => (
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3" key={scene.sceneId}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">
                          {index + 1}. {sceneRoleLabel[scene.role] ?? scene.role}
                        </span>
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
                          {sceneLayoutLabel[scene.layout] ?? scene.layout}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {scene.slots.map((slot) => (
                          <div className="rounded-lg border border-white/8 bg-white/[0.025] p-2.5" key={slot.slot}>
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-white/60">{slot.label}</span>
                              {slot.primaryAsset && (
                                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
                                  {slot.primaryAsset.score} 分
                                </span>
                              )}
                            </div>

                            {slot.primaryAsset ? (
                              <>
                                <div className="flex items-start gap-2">
                                  <span
                                    className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                                    style={{ backgroundColor: slot.primaryAsset.color }}
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-medium text-white">
                                      {slot.primaryAsset.name}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/45">
                                      {typeLabel[slot.primaryAsset.type]} · {statusLabel[slot.primaryAsset.status]}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {slot.primaryAsset.matchedTags.slice(0, 4).map((tag) => (
                                    <span
                                      className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2 py-0.5 text-[11px] text-emerald-100"
                                      key={tag}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                  {slot.backupAssets.length > 0 && (
                                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/45">
                                      备选 {slot.backupAssets.length}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="text-xs text-amber-100">{slot.warning}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/45">
                暂无选材方案
              </div>
            )}
          </section>

          <section className={cardBase}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/40">Voice</div>
                <h2 className="mt-1 text-base font-semibold text-white">语音合成</h2>
                <p className="mt-0.5 text-xs text-white/50">
                  {ttsPreview ? `${ttsPreview.clips.length} 段 · ${formatDuration(ttsPreview.totalDurationMs)}` : "等待脚本"}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-2.5 py-1 text-xs font-semibold text-fuchsia-100">
                {ttsPreview?.provider ?? "TTS"}
              </span>
            </div>

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={ttsGenerating || !scriptPreview}
              onClick={handleGenerateTts}
              type="button"
            >
              <Activity className="h-4 w-4" />
              {ttsGenerating ? "合成中..." : "本地合成语音"}
            </button>

            {ttsPreview ? (
              <div className="mt-4 max-h-[460px] space-y-2 overflow-y-auto pr-1">
                {ttsPreview.clips.map((clip, index) => (
                  <div className="rounded-xl border border-white/8 bg-black/20 p-3" key={clip.sceneId}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">
                        {index + 1}. {sceneRoleLabel[clip.role] ?? clip.role}
                      </span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
                        {formatDuration(clip.durationMs)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-5 text-white/70">{clip.copy}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/45">
                        {clip.words.length} 字幕块
                      </span>
                      {clip.fallbackReason && (
                        <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-amber-100">
                          本地兜底
                        </span>
                      )}
                    </div>
                    <audio className="mt-3 h-8 w-full" controls src={clip.audioUrl} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/45">
                暂无语音片段
              </div>
            )}
          </section>

          <section className={cardBase}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/40">Avatar</div>
                <h2 className="mt-1 text-base font-semibold text-white">数字人片段</h2>
                <p className="mt-0.5 text-xs text-white/50">
                  {digitalHumanPreview
                    ? `${digitalHumanPreview.clips.length} 段 · ${formatDuration(digitalHumanPreview.totalDurationMs)}`
                    : "等待语音"}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-violet-300/20 bg-violet-300/10 px-2.5 py-1 text-xs font-semibold text-violet-100">
                {digitalHumanPreview?.provider ?? digitalHumanProviderLabel[digitalHumanConfig.provider]}
              </span>
            </div>

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={digitalHumanGenerating || !ttsPreview}
              onClick={handleGenerateDigitalHuman}
              type="button"
            >
              <UserRound className="h-4 w-4" />
              {digitalHumanGenerating ? "生成中..." : "生成数字人片段"}
            </button>

            {digitalHumanConfig.provider === "placeholder" && (
              <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
                当前未接生产数字人服务，系统只会生成占位片段；在系统设置中接入 HTTP API 或 MuseTalk 后才是可交付链路。
              </div>
            )}

            {digitalHumanPreview ? (
              <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {digitalHumanPreview.clips.map((clip, index) => (
                  <div className="rounded-xl border border-white/8 bg-black/20 p-3" key={clip.sceneId}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">
                        {index + 1}. {sceneRoleLabel[clip.role] ?? clip.role}
                      </span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
                        {formatDuration(clip.durationMs)}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-lg" style={clip.alpha ? alphaPreviewStyle : undefined}>
                      <video className="aspect-[9/8] w-full bg-transparent" controls src={clip.videoUrl} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/45">
                        {clip.source}
                      </span>
                      {clip.alpha && (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-emerald-100">
                          透明通道
                        </span>
                      )}
                      {clip.placeholder && (
                        <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-amber-100">
                          占位片段
                        </span>
                      )}
                      {clip.alphaError && (
                        <span className="rounded-full border border-red-300/20 bg-red-300/10 px-2 py-0.5 text-red-100">
                          抠绿失败
                        </span>
                      )}
                      {clip.sourceVideoUrl && clip.sourceVideoUrl !== clip.videoUrl && (
                        <a
                          className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-white/50 transition hover:text-white"
                          href={clip.sourceVideoUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          源 MP4
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/45">
                暂无数字人片段
              </div>
            )}
          </section>

          <section className={cardBase}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">任务状态</h2>
              {generating ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ff3b5c]/30 bg-[#ff3b5c]/10 px-2.5 py-1 text-xs font-semibold text-[#ff3b5c]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b5c] pulse-dot" />
                  运行中
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/50">
                  空闲
                </span>
              )}
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/80">
              {status}
            </div>
            {currentTaskId && (
              <div className="mt-2 rounded-xl border border-cyan-300/15 bg-cyan-300/10 p-3 text-xs text-cyan-100">
                <div className="font-semibold">当前任务：{currentTaskId}</div>
                {currentRenderTask && (
                  <div className="mt-1 text-cyan-100/75">
                    {currentRenderTask.status === "completed"
                      ? "已完成"
                      : currentRenderTask.status === "failed"
                        ? "失败"
                        : "后台渲染中"} · {currentRenderTask.stage}
                  </div>
                )}
              </div>
            )}
            {renderTasks.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold text-white/55">最近生成任务</div>
                {renderTasks.slice(0, 3).map((task) => (
                  <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3" key={task.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-white">{task.brandName}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                        task.status === "completed"
                          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                          : task.status === "failed"
                            ? "border-red-300/20 bg-red-300/10 text-red-100"
                            : "border-[#ff3b5c]/30 bg-[#ff3b5c]/10 text-[#ff3b5c]"
                      }`}
                      >
                        {task.status === "completed" ? "完成" : task.status === "failed" ? "失败" : "运行"}
                      </span>
                    </div>
                    <div className="text-[11px] text-white/45">
                      {task.platform} · {task.templateName} · {task.createdAt.slice(5, 16).replace("T", " ")}
                    </div>
                    <div className="mt-1 line-clamp-1 text-[11px] text-white/55">{task.stage}</div>
                    {task.previewUrl && (
                      <a
                        className="mt-2 inline-flex rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/65 transition hover:bg-white/[0.06] hover:text-white"
                        href={task.previewUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        查看预览
                      </a>
                    )}
                    {task.payloadStored && (task.status === "failed" || task.status === "completed") && (
                      <button
                        className="ml-2 mt-2 inline-flex rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/65 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={retryingTaskId === task.id}
                        onClick={() => void handleRetryRenderTask(task.id)}
                        type="button"
                      >
                        {retryingTaskId === task.id ? "提交中..." : task.status === "failed" ? "重试" : "重渲染"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                className="btn-primary inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                disabled={generating || selectedAssets.length === 0}
                onClick={handleGenerate}
                type="button"
              >
                <Play className="h-4 w-4" />
                {generating ? "生成中..." : `生成 ${count} 条视频`}
              </button>
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/[0.07] hover:text-white transition"
                onClick={() => {
                  setStatus("待生成");
                  setCurrentTaskId("");
                  setResultUrl("");
                  setPreviewUrl("");
                  setCoverUrl("");
                  setGenerating(false);
                }}
                type="button"
              >
                <RefreshCcw className="h-4 w-4" />
                重置
              </button>
            </div>
          </section>

          {resultUrl && (
            <section className={`${cardBase} border-emerald-400/20`}>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
                生成完成
              </h2>
              <video
                className="mx-auto aspect-[9/16] w-full max-w-[240px] rounded-xl bg-black shadow-lg"
                controls
                poster={coverUrl || undefined}
                src={previewUrl || resultUrl}
              />
              <a
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/[0.07] transition"
                download
                href={resultUrl}
              >
                <Download className="h-4 w-4" />
                下载视频
              </a>
            </section>
          )}
        </aside>
      </div>

      <footer className="relative z-10 mx-auto max-w-7xl px-6 py-8 text-center text-xs text-white/30">
        Cutix · 商业 IP 视频批量生产 · Powered by Remotion
      </footer>
    </main>
  );
}
