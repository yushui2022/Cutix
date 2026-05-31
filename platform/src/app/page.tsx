"use client";

import { useMemo, useState } from "react";
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
    color: "#E7333F",
    tone: "专业、直接、有紧迫感",
    promise: "突出回本模型、门店复制和招商转化",
    defaultBgm: "商务节奏 BGM",
  },
  {
    id: "li",
    name: "李总商业",
    industry: "企业增长服务",
    color: "#2563EB",
    tone: "理性、可信、数据化",
    promise: "强调方法论、案例证据和增长结果",
    defaultBgm: "稳健科技 BGM",
  },
  {
    id: "zhang",
    name: "张姐美妆",
    industry: "美妆护肤品牌",
    color: "#DB2777",
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
    accent: "#E7333F",
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
    accent: "#2563EB",
  },
];

const assets: Asset[] = [
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
    color: "#6366f1",
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
  ready: "bg-[#ecfdf3] text-[#067647]",
  review: "bg-[#fffaeb] text-[#b54708]",
  disabled: "bg-[#f2f4f7] text-[#667085]",
};

export default function Home() {
  const [selectedIP, setSelectedIP] = useState<IP>(ips[0]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(templates[0]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["store", "product", "avatar"]);
  const [targetPlatform, setTargetPlatform] = useState(platforms[0]);
  const [copyMode, setCopyMode] = useState(copyModes[0].id);
  const [count, setCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("待生成");
  const [resultUrl, setResultUrl] = useState("");

  const selectedAssetList = useMemo(
    () => assets.filter((asset) => selectedAssets.includes(asset.id)),
    [selectedAssets],
  );

  const activeStepIndex = useMemo(() => {
    if (!generating) return -1;
    const index = pipeline.findIndex((step) => status.includes(step.name.slice(0, 2)));
    return index >= 0 ? index : 2;
  }, [generating, status]);

  const toggleAsset = (assetId: string) => {
    setSelectedAssets((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    );
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

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f3f5f8] text-[#101828]">
      <header className="border-b border-[#d8dee8] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MonitorCog className="h-5 w-5 text-[#111827]" />
              <div className="text-xl font-semibold tracking-tight">Cutix</div>
            </div>
            <div className="mt-1 text-sm text-[#667085]">商业 IP 视频生产控制台</div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <div className="rounded-lg border border-[#dfe3ea] bg-[#fbfcfd] px-3 py-2 text-sm text-[#475467]">
              Worker 空闲 3 / 队列 0
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-[#cfd6e1] bg-white px-3 py-2 text-sm font-medium hover:bg-[#f8fafc]"
              type="button"
            >
              <UploadCloud className="h-4 w-4" />
              导入素材
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)_380px]">
        <aside className="space-y-5">
          <section className="rounded-lg border border-[#dfe3ea] bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#344054]">本次生成</h2>
                <p className="mt-1 text-xs text-[#667085]">选择 IP、平台、批量和文案策略</p>
              </div>
              <Activity className="h-5 w-5 text-[#2563eb]" />
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-[#667085]">
                目标平台
                <select
                  className="mt-1 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#151922] outline-none focus:border-[#2563eb]"
                  onChange={(e) => setTargetPlatform(e.target.value)}
                  value={targetPlatform}
                >
                  {platforms.map((platform) => (
                    <option key={platform}>{platform}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-[#667085]">
                批量数量
                <input
                  className="mt-1 w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#151922] outline-none focus:border-[#2563eb]"
                  max={50}
                  min={1}
                  onChange={(e) => setCount(Number(e.target.value))}
                  type="number"
                  value={count}
                />
              </label>
            </div>

            <div className="mt-4 border-t border-[#edf0f5] pt-4">
              <div className="mb-2 text-xs font-semibold text-[#344054]">文案策略</div>
              <div className="grid grid-cols-1 gap-2">
                {copyModes.map((mode) => {
                  const selected = copyMode === mode.id;
                  return (
                    <button
                      className={`rounded-lg border p-3 text-left transition ${
                        selected ? "border-[#111827] bg-[#f9fafb]" : "border-[#e5e7eb] hover:border-[#aab3c2]"
                      }`}
                      key={mode.id}
                      onClick={() => setCopyMode(mode.id)}
                      type="button"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <WandSparkles className="h-4 w-4 text-[#2563eb]" />
                        {mode.label}
                      </div>
                      <div className="mt-1 text-xs text-[#667085]">{mode.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3ea] bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#344054]">生产链路</h2>
              <span className="rounded-full bg-[#eef4ff] px-2 py-1 text-xs font-medium text-[#2563eb]">MVP</span>
            </div>
            <div className="space-y-2">
              {pipeline.map((step, index) => {
                const StepIcon = step.icon;
                const active = index === activeStepIndex;
                const complete = generating && activeStepIndex > index;
                return (
                  <div
                    className={`rounded-lg border p-3 ${
                      active
                        ? "border-[#2563eb] bg-[#eff6ff]"
                        : complete
                          ? "border-[#bbf7d0] bg-[#f0fdf4]"
                          : "border-[#edf0f5] bg-[#fbfcfd]"
                    }`}
                    key={step.name}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          active || complete ? "bg-[#2563eb] text-white" : "bg-[#eef0f4] text-[#475467]"
                        }`}
                      >
                        <StepIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{step.name}</div>
                        <div className="mt-1 text-xs text-[#667085]">{step.detail}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="min-w-0 space-y-5">
          <section className="rounded-lg border border-[#dfe3ea] bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">IP / 品牌</h2>
                <p className="mt-1 text-sm text-[#667085]">品牌配置会影响文案、字幕、模板色彩和默认 BGM。</p>
              </div>
              <span
                className="inline-flex w-fit max-w-full rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ background: selectedIP.color }}
              >
                {selectedIP.industry}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {ips.map((ip) => (
                <button
                  className={`min-w-0 rounded-lg border p-4 text-left transition ${
                    selectedIP.id === ip.id ? "border-[#111827] bg-[#f9fafb]" : "border-[#e5e7eb] hover:border-[#aab3c2]"
                  }`}
                  key={ip.id}
                  onClick={() => setSelectedIP(ip)}
                  type="button"
                >
                  <div className="mb-3 h-2 w-14 rounded-full" style={{ background: ip.color }} />
                  <div className="truncate font-semibold">{ip.name}</div>
                  <div className="mt-1 text-xs text-[#667085]">{ip.tone}</div>
                  <div className="mt-3 text-xs leading-5 text-[#344054]">{ip.promise}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3ea] bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">素材库</h2>
                <p className="mt-1 text-sm text-[#667085]">接入自动标签结果，生成时按标签和 IP 规则匹配素材。</p>
              </div>
              <button className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white hover:bg-black" type="button">
                <UploadCloud className="h-4 w-4" />
                上传
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {assets.map((asset) => {
                const selected = selectedAssets.includes(asset.id);
                return (
                  <button
                    className={`min-w-0 rounded-lg border p-3 text-left transition ${
                      selected ? "border-[#111827] bg-[#f9fafb]" : "border-[#e5e7eb] hover:border-[#aab3c2]"
                    }`}
                    key={asset.id}
                    onClick={() => toggleAsset(asset.id)}
                    type="button"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ background: `linear-gradient(135deg, ${asset.color}, #111827)` }}
                      >
                        {asset.type === "avatar" ? <UserRound className="h-6 w-6" /> : <Clapperboard className="h-6 w-6" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{asset.name}</div>
                            <div className="mt-1 text-xs text-[#667085]">{asset.source}</div>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusStyle[asset.status]}`}>
                            {statusLabel[asset.status]}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-[#667085]">
                          {typeLabel[asset.type]} · {asset.orientation} · {asset.duration} · 匹配 {asset.matchScore}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {asset.tags.map((tag) => (
                            <span className="rounded-full bg-[#eef0f4] px-2 py-1 text-[11px] text-[#475467]" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3ea] bg-white p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">模板</h2>
                <p className="mt-1 text-sm text-[#667085]">模板决定数字人、素材、字幕和 BGM 的画面结构。</p>
              </div>
              <span className="text-sm text-[#667085]">{selectedTemplate.duration}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {templates.map((template) => (
                <button
                  className={`min-w-0 rounded-lg border p-4 text-left transition ${
                    selectedTemplate.id === template.id ? "border-[#111827] bg-[#f9fafb]" : "border-[#e5e7eb] hover:border-[#aab3c2]"
                  }`}
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  type="button"
                >
                  <div className="mb-3 h-2 w-12 rounded-full" style={{ background: template.accent }} />
                  <div className="text-xs font-medium text-[#667085]">{template.category}</div>
                  <div className="mt-1 font-semibold">{template.name}</div>
                  <div className="mt-2 text-xs text-[#667085]">{template.layout}</div>
                  <div className="mt-3 text-xs text-[#344054]">{template.bestFor}</div>
                </button>
              ))}
            </div>
          </section>
        </section>

        <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
          <section className="rounded-lg border border-[#dfe3ea] bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">视频预览</h2>
                <p className="mt-1 text-xs text-[#667085]">{selectedTemplate.layout}</p>
              </div>
              <span className="rounded-full bg-[#ecfdf3] px-2 py-1 text-xs font-medium text-[#067647]">9:16</span>
            </div>

            <div className="mx-auto aspect-[9/16] w-full max-w-[310px] overflow-hidden rounded-lg border border-[#dfe3ea] bg-[#101828] text-white shadow-sm">
              <div className="flex h-[58%] items-center justify-center px-6 text-center" style={{ background: `linear-gradient(180deg, ${selectedIP.color}, #111827)` }}>
                <div>
                  <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-white/30 bg-white/10">
                    <UserRound className="h-10 w-10 text-white/80" />
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
                    style={{ background: asset.color }}
                  >
                    {asset.name}
                  </div>
                ))}
              </div>
              <div className="flex h-[12%] items-center justify-center bg-black px-4 text-center text-xs font-medium leading-5">
                普通门店如何复制增长模型？
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[#dfe3ea] bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">任务状态</h2>
              {generating ? (
                <span className="rounded-full bg-[#eff6ff] px-2 py-1 text-xs font-medium text-[#2563eb]">运行中</span>
              ) : (
                <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs font-medium text-[#667085]">空闲</span>
              )}
            </div>
            <div className="rounded-lg border border-[#edf0f5] bg-[#fbfcfd] p-3 text-sm text-[#344054]">{status}</div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#111827] px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={generating || selectedAssets.length === 0}
                onClick={handleGenerate}
                type="button"
              >
                <Play className="h-4 w-4" />
                {generating ? "生成中..." : `生成 ${count} 条视频`}
              </button>
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#d0d5dd] bg-white px-4 py-3 text-sm font-semibold text-[#344054] hover:bg-[#f8fafc]"
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
            <section className="rounded-lg border border-[#bbf7d0] bg-white p-4">
              <h2 className="mb-3 text-base font-semibold text-[#067647]">生成完成</h2>
              <video className="mx-auto aspect-[9/16] w-full max-w-[240px] rounded-lg bg-black" controls src={resultUrl} />
              <a
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#d0d5dd] px-4 py-2 text-center text-sm font-medium"
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
    </main>
  );
}
