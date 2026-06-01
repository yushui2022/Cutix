"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Sparkles,
  Tags,
  UploadCloud,
  UserRound,
  WandSparkles,
} from "lucide-react";
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

type PipelineStep = {
  name: string;
  detail: string;
  icon: LucideIcon;
};

const ips: IP[] = [
  {
    id: "wang",
    name: "老王餐饮",
    industry: "餐饮招商加盟",
    color: "#FF3B5C",
    tone: "专业、直接、有紧迫感",
    promise: "突出回本模型、门店复制和招商转化",
    defaultBgm: "商务节奏 BGM",
  },
  {
    id: "li",
    name: "李总商业",
    industry: "企业增长服务",
    color: "#38BDF8",
    tone: "理性、可信、数据化",
    promise: "强调方法论、案例证据和增长结果",
    defaultBgm: "稳健科技 BGM",
  },
  {
    id: "zhang",
    name: "张姐美妆",
    industry: "美妆护肤品牌",
    color: "#F472B6",
    tone: "亲近、审美强、重体验",
    promise: "突出前后对比、真实体验和社交种草",
    defaultBgm: "轻快生活 BGM",
  },
];

const templates: Template[] = [
  {
    id: "split",
    name: "数字人 + 素材分屏",
    category: "口播混剪",
    duration: "30s",
    layout: "数字人在上，素材在下",
    bestFor: "招商、口播、IP 短视频",
    accent: "#FF3B5C",
  },
  {
    id: "product",
    name: "产品卖点介绍",
    category: "产品",
    duration: "35s",
    layout: "素材主画面，数字人角标",
    bestFor: "产品讲解、服务说明",
    accent: "#14B8A6",
  },
  {
    id: "case",
    name: "案例证明短片",
    category: "案例",
    duration: "40s",
    layout: "数据卡 + B-roll + 字幕",
    bestFor: "案例、背书、成交证明",
    accent: "#A855F7",
  },
];

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
  { name: "文案生成", detail: "按 IP 口吻生成脚本和字幕", icon: FileText },
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

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIP, setSelectedIP] = useState<IP>(ips[0]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(templates[0]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["store", "product", "avatar"]);
  const [assets, setAssets] = useState<Asset[]>(seedAssets);
  const [targetPlatform, setTargetPlatform] = useState(platforms[0]);
  const [copyMode, setCopyMode] = useState(copyModes[0].id);
  const [count, setCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [status, setStatus] = useState("待生成");
  const [resultUrl, setResultUrl] = useState("");

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

  const selectedAssetList = useMemo(
    () => assets.filter((asset) => selectedAssets.includes(asset.id)),
    [assets, selectedAssets],
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

  const processEventLine = (line: string) => {
    if (!line.startsWith("data: ")) return;

    try {
      const data: unknown = JSON.parse(line.slice(6));
      if (typeof data !== "object" || data === null) return;
      if ("status" in data && typeof data.status === "string") setStatus(data.status);
      if ("resultUrl" in data && typeof data.resultUrl === "string") setResultUrl(data.resultUrl);
    } catch {
      // Ignore incomplete stream chunks; the next chunk will carry the remainder.
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setStatus("正在生成文案...");
    setResultUrl("");

    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ipId: selectedIP.id,
          templateId: selectedTemplate.id,
          assetIds: selectedAssets,
          targetPlatform,
          copyMode,
          count,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processEventLine(line);
      }
      if (buffer) processEventLine(buffer);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setStatus("失败: " + message);
    } finally {
      setGenerating(false);
    }
  };

  const cardBase = "glass rounded-2xl p-5";
  const optionBase =
    "min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left card-hover";

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
                <p className="mt-1 text-sm text-white/50">模板决定数字人、素材、字幕和 BGM 的画面结构。</p>
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
          </section>
        </section>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <section className={cardBase}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/40">Preview</div>
                <h2 className="mt-1 text-base font-semibold text-white">视频预览</h2>
                <p className="mt-0.5 text-xs text-white/50">{selectedTemplate.layout}</p>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                9:16
              </span>
            </div>

            <div className="relative mx-auto aspect-[9/16] w-full max-w-[290px] overflow-hidden rounded-2xl border border-white/10 bg-black text-white shadow-2xl shadow-black/60">
              <div
                className="flex h-[58%] items-center justify-center px-6 text-center"
                style={{
                  background: `linear-gradient(180deg, ${selectedIP.color}, #0a0b14)`,
                }}
              >
                <div>
                  <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-sm">
                    <UserRound className="h-10 w-10 text-white/90" />
                  </div>
                  <div className="text-sm font-semibold">{selectedIP.name} 数字人</div>
                  <div className="mt-2 text-xs text-white/70">{selectedIP.tone}</div>
                </div>
              </div>
              <div className="grid h-[30%] grid-cols-2 gap-px bg-white/10">
                {(selectedAssetList.length ? selectedAssetList.slice(0, 2) : assets.slice(0, 2)).map((asset) => (
                  <div
                    className="flex items-center justify-center px-3 text-center text-xs font-medium"
                    key={asset.id}
                    style={{
                      background: `linear-gradient(135deg, ${asset.color}, ${asset.color}88)`,
                    }}
                  >
                    {asset.name}
                  </div>
                ))}
              </div>
              <div className="flex h-[12%] items-center justify-center bg-black/90 px-4 text-center text-xs font-medium leading-5">
                普通门店如何复制增长模型？
              </div>
            </div>
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
                  setResultUrl("");
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
                src={resultUrl}
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
