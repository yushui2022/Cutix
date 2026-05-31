import { NextRequest } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// IP configs — in production from DB
const ipConfigs: Record<string, {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoText: string;
}> = {
  wang: { name: "老王餐饮", primaryColor: "#E7333F", secondaryColor: "#1A1A2E", logoText: "老王餐饮" },
  li: { name: "李总商业", primaryColor: "#3B82F6", secondaryColor: "#0F172A", logoText: "李总商业" },
  zhang: { name: "张姐美妆", primaryColor: "#EC4899", secondaryColor: "#1C0F1A", logoText: "张姐美妆" },
};

function words(text: string, offsetMs = 0) {
  const msPerChar = 200; // ~5 chars/sec
  const total = text.length * msPerChar;
  const result: { text: string; startMs: number; endMs: number }[] = [];
  let pos = 0;
  while (pos < text.length) {
    const size = Math.min(2 + Math.floor(Math.random() * 2), text.length - pos);
    result.push({
      text: text.slice(pos, pos + size),
      startMs: offsetMs + (pos / text.length) * total,
      endMs: offsetMs + ((pos + size) / text.length) * total,
    });
    pos += size;
  }
  return { words: result, totalMs: total };
}

function buildScript(ipId: string) {
  const ip = ipConfigs[ipId];
  if (!ip) throw new Error("Unknown IP");

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
  const hook = words(s[0]);
  const pain = words(s[1]);
  const cta = words(s[3]);

  return {
    brand: { name: ip.name, primaryColor: ip.primaryColor, secondaryColor: ip.secondaryColor, logoText: ip.logoText },
    scenes: [
      { layout: "full_dh", startSec: 0, durationSec: 5, subtitleWords: hook.words },
      { layout: "dh_top_broll_bottom", startSec: 5, durationSec: 10, subtitleWords: pain.words },
      { layout: "full_broll", startSec: 15, durationSec: 8, subtitleWords: [{ text: s[2], startMs: 0, endMs: 8000 }], overlayText: s[2] },
      { layout: "full_dh", startSec: 23, durationSec: 7, subtitleWords: cta.words },
    ],
  };
}

function runRemotionCli(props: unknown, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const propsJson = JSON.stringify(props).replace(/"/g, '\\"');
    const cmd = `npx remotion render SplitScreen "${outputPath}" --props="${propsJson}"`;
    const child = exec(cmd, { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024, timeout: 5 * 60 * 1000 });
    let lastProgress = "";
    child.stderr?.on("data", (d) => { lastProgress = d.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Remotion exit ${code}: ${lastProgress.slice(-200)}`));
    });
  });
}

export async function POST(request: NextRequest) {
  const { ipId } = await request.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ status: "正在生成文案..." });
        const script = buildScript(ipId);

        send({ status: "Remotion 渲染中（约 30 秒）..." });

        const outputId = `cutix_${ipId}_${Date.now()}`;
        const outputFile = path.join(os.tmpdir(), `${outputId}.mp4`);

        await runRemotionCli(script, outputFile);

        // Copy to public
        const publicDir = path.join(process.cwd(), "public", "output");
        fs.mkdirSync(publicDir, { recursive: true });
        const publicFile = path.join(publicDir, `${outputId}.mp4`);
        fs.copyFileSync(outputFile, publicFile);

        send({ status: "完成！", resultUrl: `/output/${outputId}.mp4` });
      } catch (error: any) {
        console.error("Render error:", error);
        send({ status: `失败: ${error.message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
