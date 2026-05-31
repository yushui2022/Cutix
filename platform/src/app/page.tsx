"use client";

import { useState } from "react";

type IP = {
  id: string;
  name: string;
  avatar: string;
  industry: string;
  color: string;
};

const defaultIPs: IP[] = [
  {
    id: "wang",
    name: "老王餐饮",
    avatar: "🍜",
    industry: "餐饮招商加盟",
    color: "#E7333F",
  },
  {
    id: "li",
    name: "李总商业",
    avatar: "💼",
    industry: "企业服务",
    color: "#3B82F6",
  },
  {
    id: "zhang",
    name: "张姐美妆",
    avatar: "💄",
    industry: "美妆护肤",
    color: "#EC4899",
  },
];

export default function Home() {
  const [selectedIP, setSelectedIP] = useState<IP | null>(null);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [resultUrl, setResultUrl] = useState("");

  const handleGenerate = async () => {
    if (!selectedIP) return;
    setGenerating(true);
    setStatus("正在生成文案...");
    setResultUrl("");

    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipId: selectedIP.id, ipName: selectedIP.name }),
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

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.status) setStatus(data.status);
            if (data.resultUrl) setResultUrl(data.resultUrl);
          }
        }
      }
    } catch (e: any) {
      setStatus("失败: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-10 pt-8">
        <h1 className="text-3xl font-bold mb-2">Cutix</h1>
        <p className="text-gray-400">商业短视频批量生成平台</p>
      </div>

      {/* IP 选择 */}
      <h2 className="text-lg font-semibold mb-4">选择商业 IP</h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {defaultIPs.map((ip) => (
          <button
            key={ip.id}
            onClick={() => !generating && setSelectedIP(ip)}
            className={`p-6 rounded-xl border-2 transition-all text-left cursor-pointer
              ${selectedIP?.id === ip.id
                ? "border-white shadow-lg scale-[1.02]"
                : "border-gray-700 hover:border-gray-500"
              } ${generating ? "opacity-50 cursor-not-allowed" : ""}`}
            style={{
              background: selectedIP?.id === ip.id
                ? `linear-gradient(135deg, ${ip.color}22, ${ip.color}08)`
                : "linear-gradient(135deg, #1a1a2e, #16213e)",
            }}
          >
            <div className="text-4xl mb-3">{ip.avatar}</div>
            <div className="font-bold text-lg">{ip.name}</div>
            <div className="text-sm text-gray-400 mt-1">{ip.industry}</div>
          </button>
        ))}
      </div>

      {/* 生成区域 */}
      {selectedIP && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 mb-8 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400">已选择</div>
              <div className="text-xl font-bold">{selectedIP.name}</div>
              <div className="text-sm text-gray-400">{selectedIP.industry}</div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-8 py-4 rounded-xl text-lg font-bold text-white cursor-pointer
                disabled:opacity-40 disabled:cursor-not-allowed transition-all
                hover:scale-105 active:scale-95"
              style={{ background: selectedIP.color }}
            >
              {generating ? "生成中..." : "生成视频"}
            </button>
          </div>
        </div>
      )}

      {/* 状态 */}
      {status && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-700 mb-8">
          <div className="text-sm text-gray-400 mb-2">状态</div>
          <div className="flex items-center gap-3">
            {generating && (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-lg">{status}</span>
          </div>
        </div>
      )}

      {/* 结果 */}
      {resultUrl && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-green-700">
          <div className="text-lg font-bold mb-4 text-green-400">生成完成!</div>
          <video
            src={resultUrl}
            controls
            className="w-full max-w-[360px] mx-auto rounded-lg"
            style={{ aspectRatio: "9/16" }}
          />
          <a
            href={resultUrl}
            download
            className="block text-center mt-4 px-6 py-3 bg-brand rounded-lg font-bold cursor-pointer hover:opacity-90"
          >
            下载视频
          </a>
        </div>
      )}
    </main>
  );
}
