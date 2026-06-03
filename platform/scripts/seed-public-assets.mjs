import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const samplesDir = path.join(publicDir, "samples", "commons");
const thumbnailDir = path.join(samplesDir, "thumbnails");
const keyframeDir = path.join(samplesDir, "keyframes");
const dataDir = path.join(rootDir, "data");
const assetsFile = path.join(dataDir, "assets.json");
const manifestFile = path.join(samplesDir, "manifest.json");
const attributionFile = path.join(samplesDir, "ATTRIBUTION.md");

const batchId = "commons-public-sample-2026-06-03";

const sources = [
  {
    id: "commons-office-workspace",
    name: "办公室工作台",
    type: "image",
    fileName: "office-workspace.jpg",
    downloadUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Desk-office-workspace-coworking_%2823699033283%29.jpg/1280px-Desk-office-workspace-coworking_%2823699033283%29.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Desk-office-workspace-coworking_(23699033283).jpg",
    license: "CC0 1.0",
    author: "Pexels / Wikimedia Commons contributor",
    tags: ["办公", "企业服务", "桌面", "中景", "B-roll", "16:9"],
    summary: "现代办公桌面和协作工作区，可作为企业服务、SaaS、效率工具类 IP 的背景素材。",
    matchScore: 91,
  },
  {
    id: "commons-retail-interior",
    name: "零售门店内景",
    type: "image",
    fileName: "retail-store-interior.jpg",
    downloadUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Benjamin_Pollocks_Toy_Shop_interior_1.jpg/1280px-Benjamin_Pollocks_Toy_Shop_interior_1.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Benjamin_Pollocks_Toy_Shop_interior_1.jpg",
    license: "CC0 1.0",
    author: "Wikimedia Commons contributor",
    tags: ["门店", "零售", "产品", "货架", "远景", "B-roll", "16:9"],
    summary: "有真实货架和店内陈列的零售场景，适合招商、加盟、线下门店案例类视频。",
    matchScore: 89,
  },
  {
    id: "commons-kitchen-station",
    name: "餐饮后厨出餐台",
    type: "image",
    fileName: "restaurant-kitchen-station.jpg",
    downloadUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Restaurant_Kitchen_expo_station.jpg/1280px-Restaurant_Kitchen_expo_station.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Restaurant_Kitchen_expo_station.jpg",
    license: "CC0 1.0",
    author: "Wikimedia Commons contributor",
    tags: ["餐饮", "后厨", "服务", "流程", "证明", "中景", "B-roll", "16:9"],
    summary: "餐饮后厨工作台画面，可用于食品、餐饮加盟、流程展示和交付能力证明。",
    matchScore: 92,
  },
  {
    id: "commons-warehouse",
    name: "仓储空间外观",
    type: "image",
    fileName: "warehouse-logistics.jpg",
    downloadUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Warehouse_in_Hokkaido.jpg/1280px-Warehouse_in_Hokkaido.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Warehouse_in_Hokkaido.jpg",
    license: "CC0 1.0",
    author: "Wikimedia Commons contributor",
    tags: ["仓储", "物流", "供应链", "远景", "证明", "B-roll", "16:9"],
    summary: "仓储建筑外景，适合物流、供应链、仓配能力、B2B 服务类视频。",
    matchScore: 84,
  },
  {
    id: "commons-product-display",
    name: "产品陈列货架",
    type: "image",
    fileName: "product-display.jpg",
    downloadUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Product_display_in_Don_Quijote_Shibuya_branch.jpg/1280px-Product_display_in_Don_Quijote_Shibuya_branch.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Product_display_in_Don_Quijote_Shibuya_branch.jpg",
    license: "CC0 1.0",
    author: "Wikimedia Commons contributor",
    tags: ["产品", "零售", "货架", "特写", "转化", "B-roll", "16:9"],
    summary: "密集产品陈列画面，可用于商品丰富度、爆品矩阵、促销活动等商业叙事。",
    matchScore: 88,
  },
  {
    id: "commons-business-chart",
    name: "业务增长图表",
    type: "image",
    fileName: "business-chart.jpg",
    downloadUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Business_man_with_graph_chart_on_iPad.jpg/1280px-Business_man_with_graph_chart_on_iPad.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Business_man_with_graph_chart_on_iPad.jpg",
    license: "CC0 1.0",
    author: "Wikimedia Commons contributor",
    tags: ["数据", "增长", "企业服务", "证明", "特写", "B-roll", "16:9"],
    summary: "带增长曲线的数据画面，适合用作案例证明、业绩增长、商业分析类镜头。",
    matchScore: 90,
  },
  {
    id: "commons-video-kitchen",
    name: "餐饮厨房短视频",
    type: "video",
    fileName: "restaurant-kitchen.webm",
    downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/9/9b/Tawa_kitchen_mp4.webm",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Tawa_kitchen_mp4.webm",
    license: "CC0 1.0",
    author: "Wikimedia Commons contributor",
    tags: ["餐饮", "后厨", "服务", "流程", "中景", "B-roll", "16:9"],
    summary: "餐饮厨房动态片段，适合作为数字人口播下方的经营现场 B-roll。",
    matchScore: 93,
  },
  {
    id: "commons-video-cafe",
    name: "咖啡门店氛围短视频",
    type: "video",
    fileName: "cafe-interior.webm",
    downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/0/0f/Rateel_cafe_music1.webm",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Rateel_cafe_music1.webm",
    license: "CC0 1.0",
    author: "Wikimedia Commons contributor",
    tags: ["门店", "餐饮", "氛围", "活动", "中景", "B-roll", "16:9"],
    summary: "咖啡店内动态画面，可用于门店氛围、消费场景、活动预热类模板。",
    matchScore: 87,
  },
  {
    id: "commons-video-office",
    name: "办公室巡览短视频",
    type: "video",
    fileName: "office-tour.webm",
    downloadUrl:
      "https://upload.wikimedia.org/wikipedia/commons/7/75/2013-03-23_12-08-00_En_liten_rundtur_p%C3%A5_kontoret.webm",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:2013-03-23_12-08-00_En_liten_rundtur_p%C3%A5_kontoret.webm",
    license: "CC0 1.0",
    author: "Wikimedia Commons contributor",
    tags: ["办公", "企业服务", "团队", "远景", "B-roll", "16:9"],
    summary: "办公室空间巡览，可用于企业服务、团队展示、公司介绍类商业 IP 视频。",
    matchScore: 85,
  },
];

function mediaColor(type) {
  return type === "image" ? "#38bdf8" : "#f97316";
}

function requestModule(url) {
  return url.startsWith("https:") ? https : http;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadFileOnce(url, filePath) {
  return new Promise((resolve, reject) => {
    const request = requestModule(url).get(
      url,
      {
        headers: {
          "User-Agent": "CutixSampleSeeder/0.1 (public sample asset seeding)",
          Accept: "*/*",
        },
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
          response.resume();
          downloadFile(new URL(response.headers.location, url).toString(), filePath).then(resolve, reject);
          return;
        }

        if ((response.statusCode ?? 500) >= 400) {
          response.resume();
          const error = new Error(`HTTP ${response.statusCode} while downloading ${url}`);
          error.statusCode = response.statusCode;
          error.retryAfter = response.headers["retry-after"];
          reject(error);
          return;
        }

        const stream = createWriteStream(filePath);
        response.pipe(stream);
        stream.on("finish", () => stream.close(resolve));
        stream.on("error", reject);
      },
    );

    request.on("error", reject);
    request.setTimeout(300000, () => {
      const error = new Error(`Timeout while downloading ${url}`);
      error.retryable = true;
      request.destroy(error);
    });
  });
}

async function downloadFile(url, filePath) {
  const maxAttempts = 5;
  const tempPath = `${filePath}.part`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rm(tempPath, { force: true });
      await downloadFileOnce(url, tempPath);
      await fs.rename(tempPath, filePath);
      return;
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      const retryable = error.retryable || error.statusCode === 429 || error.statusCode >= 500;
      if (!retryable || attempt === maxAttempts) throw error;

      const retryAfterSeconds = Number(error.retryAfter);
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(10000, retryAfterSeconds * 1000)
        : Math.min(45000, 5000 * attempt * attempt);
      console.warn(`Download throttled; retrying in ${Math.round(delayMs / 1000)}s (${attempt}/${maxAttempts})`);
      await sleep(delayMs);
    }
  }
}

async function ensureFile(source) {
  const filePath = path.join(samplesDir, source.fileName);
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > 0) {
      const probe = await probeMedia(filePath);
      if (probe.width && probe.height) return filePath;
      console.warn(`Existing file is incomplete, redownloading: ${source.fileName}`);
      await fs.rm(filePath, { force: true });
    }
  } catch {
    // Download below.
  }

  console.log(`Downloading ${source.name}`);
  await downloadFile(source.downloadUrl, filePath);
  await sleep(1500);
  return filePath;
}

function pickBinary(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const bundled = path.join(rootDir, "node_modules", "@remotion", "compositor-win32-x64-msvc", exe);
  return bundled;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      shell: false,
      windowsHide: true,
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${path.basename(command)} exited ${code}: ${output.slice(-1200)}`));
    });
  });
}

async function probeMedia(filePath) {
  const ffprobe = pickBinary("ffprobe");
  try {
    const raw = await run(ffprobe, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);
    const metadata = JSON.parse(raw);
    const videoStream = metadata.streams?.find((stream) => stream.codec_type === "video") ?? {};
    const durationSec = Number(metadata.format?.duration || videoStream.duration || 0);
    return {
      width: Number(videoStream.width || 0) || undefined,
      height: Number(videoStream.height || 0) || undefined,
      durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined,
    };
  } catch (error) {
    console.warn(`Media probe failed for ${filePath}: ${error.message}`);
    return {};
  }
}

async function createVideoFrames(source, filePath) {
  const ffmpeg = pickBinary("ffmpeg");
  const thumbnailName = `${source.id}.jpg`;
  const thumbnailPath = path.join(thumbnailDir, thumbnailName);
  const keyframes = [];

  try {
    await run(ffmpeg, ["-y", "-ss", "00:00:01", "-i", filePath, "-frames:v", "1", "-vf", "scale=480:-1", thumbnailPath]);
  } catch (error) {
    console.warn(`Thumbnail extraction failed for ${source.id}: ${error.message}`);
  }

  for (const [index, timestamp] of ["00:00:00.5", "00:00:02", "00:00:04"].entries()) {
    const frameName = `${source.id}-${index + 1}.jpg`;
    const framePath = path.join(keyframeDir, frameName);
    try {
      await run(ffmpeg, ["-y", "-ss", timestamp, "-i", filePath, "-frames:v", "1", "-vf", "scale=360:-1", framePath]);
      keyframes.push(`/samples/commons/keyframes/${frameName}`);
    } catch (error) {
      console.warn(`Keyframe ${index + 1} extraction failed for ${source.id}: ${error.message}`);
    }
  }

  return {
    thumbnailUrl: `/samples/commons/thumbnails/${thumbnailName}`,
    keyframes,
  };
}

function inferOrientation(width, height) {
  if (!width || !height) return "16:9";
  const ratio = width / height;
  if (ratio > 1.2) return "16:9";
  if (ratio < 0.85) return "9:16";
  return "1:1";
}

function formatDuration(seconds, type) {
  if (type === "image") return "静帧";
  if (!seconds || !Number.isFinite(seconds)) return "待分析";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

async function createAsset(source) {
  const filePath = await ensureFile(source);
  const stat = await fs.stat(filePath);
  const url = `/samples/commons/${source.fileName}`;
  const probe = await probeMedia(filePath);
  const frames = source.type === "video"
    ? await createVideoFrames(source, filePath)
    : { thumbnailUrl: url, keyframes: [url] };

  return {
    id: source.id,
    name: source.name,
    type: source.type,
    duration: formatDuration(probe.durationSec, source.type),
    orientation: inferOrientation(probe.width, probe.height),
    tags: source.tags,
    status: "ready",
    color: mediaColor(source.type),
    source: `Wikimedia Commons / ${source.license}`,
    matchScore: source.matchScore,
    url,
    thumbnailUrl: frames.thumbnailUrl,
    fileName: source.fileName,
    size: stat.size,
    uploadedAt: new Date().toISOString(),
    analysis: {
      status: source.type === "video" ? "keyframed" : "metadata-only",
      keyframes: frames.keyframes,
      width: probe.width,
      height: probe.height,
      durationMs: probe.durationSec ? Math.round(probe.durationSec * 1000) : undefined,
      visionStatus: "公开样例素材已人工预打标签，可接入本地视觉模型后再次分析。",
      visionProvider: "manual-public-seed",
      summary: source.summary,
      analyzedAt: new Date().toISOString(),
    },
    license: source.license,
    sourceUrl: source.sourceUrl,
    author: source.author,
    seedBatch: batchId,
  };
}

async function readExistingAssets() {
  try {
    const raw = await fs.readFile(assetsFile, "utf8");
    const assets = JSON.parse(raw);
    return Array.isArray(assets) ? assets : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeAttribution(assets) {
  const lines = [
    "# Cutix public sample assets",
    "",
    "These files are downloaded from Wikimedia Commons for local demo and tagging tests. They are intentionally ignored by Git because media files should not be committed to the repository.",
    "",
    "| Asset | License | Author | Source | Local file |",
    "| --- | --- | --- | --- | --- |",
    ...assets.map((asset) =>
      `| ${asset.name} | ${asset.license} | ${asset.author} | ${asset.sourceUrl} | ${asset.url} |`,
    ),
    "",
    "Run `node scripts/seed-public-assets.mjs` from the `platform` directory to recreate this local sample library.",
    "",
  ];

  await fs.writeFile(attributionFile, lines.join("\n"), "utf8");
}

async function main() {
  await fs.mkdir(samplesDir, { recursive: true });
  await fs.mkdir(thumbnailDir, { recursive: true });
  await fs.mkdir(keyframeDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  const seededAssets = [];
  for (const source of sources) {
    seededAssets.push(await createAsset(source));
  }

  const existingAssets = await readExistingAssets();
  const preservedAssets = existingAssets.filter((asset) => asset.seedBatch !== batchId);
  const nextAssets = [...preservedAssets, ...seededAssets];

  await fs.writeFile(assetsFile, JSON.stringify(nextAssets, null, 2), "utf8");
  await fs.writeFile(manifestFile, JSON.stringify({ batchId, assets: seededAssets }, null, 2), "utf8");
  await writeAttribution(seededAssets);

  console.log(`Seeded ${seededAssets.length} public sample assets.`);
  console.log(`Assets JSON: ${assetsFile}`);
  console.log(`Attribution: ${attributionFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
