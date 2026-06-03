import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const userAgent = "CutixSampleSeeder/0.2 (local demo asset library; contact: local)";
const targetAssetCount = Number(process.env.CUTIX_SAMPLE_ASSET_TARGET || 90);
const targetVideoCount = Number(process.env.CUTIX_SAMPLE_VIDEO_TARGET || 8);
const maxVideoBytes = Number(process.env.CUTIX_SAMPLE_MAX_VIDEO_MB || 6) * 1024 * 1024;
const searchLimitPerProfile = Number(process.env.CUTIX_SAMPLE_SEARCH_LIMIT || 24);

const curatedSources = [
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

const imageProfiles = [
  profile("office-workspace", "办公工作区", "office workspace CC0 filetype:bitmap", ["办公", "企业服务", "桌面", "中景", "B-roll", "16:9"]),
  profile("meeting-room", "会议室沟通", "meeting room CC0 filetype:bitmap", ["办公", "团队", "会议", "中景", "证明", "B-roll", "16:9"]),
  profile("retail-store", "零售门店", "retail store interior CC0 filetype:bitmap", ["门店", "零售", "产品", "货架", "B-roll", "16:9"]),
  profile("shop-interior", "店铺内景", "shop interior CC0 filetype:bitmap", ["门店", "零售", "陈列", "远景", "B-roll", "16:9"]),
  profile("product-display", "产品陈列", "product display CC0 filetype:bitmap", ["产品", "货架", "特写", "转化", "B-roll", "16:9"]),
  profile("restaurant-kitchen", "餐饮厨房", "restaurant kitchen CC0 filetype:bitmap", ["餐饮", "后厨", "流程", "服务", "B-roll", "16:9"]),
  profile("cafe-interior", "咖啡门店", "cafe interior CC0 filetype:bitmap", ["门店", "餐饮", "氛围", "活动", "B-roll", "16:9"]),
  profile("warehouse", "仓储物流", "warehouse CC0 filetype:bitmap", ["仓储", "物流", "供应链", "证明", "B-roll", "16:9"]),
  profile("factory", "工厂生产", "factory CC0 filetype:bitmap", ["工厂", "生产", "流程", "证明", "B-roll", "16:9"]),
  profile("production-line", "生产线", "production line CC0 filetype:bitmap", ["工厂", "生产线", "流程", "中景", "证明", "B-roll", "16:9"]),
  profile("business-chart", "业务数据", "business chart CC0 filetype:bitmap", ["数据", "增长", "企业服务", "证明", "特写", "B-roll", "16:9"]),
  profile("training", "教育培训", "classroom training CC0 filetype:bitmap", ["教育", "课程", "培训", "中景", "B-roll", "16:9"]),
  profile("beauty-product", "美妆产品", "beauty product CC0 filetype:bitmap", ["美妆", "产品", "特写", "转化", "B-roll", "16:9"]),
  profile("food-product", "食品产品", "food product display CC0 filetype:bitmap", ["餐饮", "食品", "产品", "特写", "B-roll", "16:9"]),
  profile("exhibition", "展会展台", "trade show booth CC0 filetype:bitmap", ["展会", "招商", "活动", "远景", "B-roll", "16:9"]),
  profile("customer-service", "客户服务", "customer service office CC0 filetype:bitmap", ["客户", "服务", "办公", "中景", "B-roll", "16:9"]),
  profile("packaging", "包装交付", "packaging product CC0 filetype:bitmap", ["包装", "产品", "交付", "证明", "B-roll", "16:9"]),
  profile("live-room", "直播间", "live streaming room CC0 filetype:bitmap", ["直播间", "口播", "活动", "转化", "B-roll", "16:9"]),
];

const videoProfiles = [
  profile("video-office", "办公动态", "office CC0 filetype:video", ["办公", "企业服务", "团队", "B-roll", "16:9"]),
  profile("video-cafe", "咖啡门店动态", "cafe CC0 filetype:video", ["门店", "餐饮", "氛围", "B-roll", "16:9"]),
  profile("video-kitchen", "餐饮厨房动态", "restaurant kitchen CC0 filetype:video", ["餐饮", "后厨", "流程", "B-roll", "16:9"]),
  profile("video-shop", "店铺动态", "shop CC0 filetype:video", ["门店", "零售", "活动", "B-roll", "16:9"]),
  profile("video-store", "零售动态", "store filetype:video", ["门店", "零售", "货架", "B-roll", "16:9"]),
  profile("video-warehouse", "仓储动态", "warehouse filetype:video", ["仓储", "物流", "供应链", "B-roll", "16:9"]),
  profile("video-factory", "工厂动态", "factory filetype:video", ["工厂", "生产", "流程", "B-roll", "16:9"]),
  profile("video-presentation", "演示汇报动态", "business presentation filetype:video", ["企业服务", "数据", "证明", "B-roll", "16:9"]),
  profile("video-customer", "客户服务动态", "customer service filetype:video", ["客户", "服务", "证明", "B-roll", "16:9"]),
  profile("video-shopping", "商场动态", "shopping mall filetype:video", ["门店", "零售", "人流", "活动", "B-roll", "16:9"]),
  profile("video-coffee-shop", "咖啡店动态", "coffee shop filetype:video", ["门店", "餐饮", "氛围", "B-roll", "16:9"]),
  profile("video-food", "食品制作动态", "food preparation filetype:video", ["餐饮", "产品", "流程", "B-roll", "16:9"]),
];

function profile(id, label, query, tags) {
  return { id, label, query, tags };
}

function mediaColor(type) {
  return type === "image" ? "#38bdf8" : "#f97316";
}

function requestModule(url) {
  return url.startsWith("https:") ? https : http;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    const request = requestModule(url).get(
      url,
      {
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json,text/plain,*/*",
        },
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
          response.resume();
          requestText(new URL(response.headers.location, url).toString()).then(resolve, reject);
          return;
        }

        if ((response.statusCode ?? 500) >= 400) {
          response.resume();
          const error = new Error(`HTTP ${response.statusCode} while requesting ${url}`);
          error.statusCode = response.statusCode;
          error.retryAfter = response.headers["retry-after"];
          reject(error);
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      },
    );

    request.on("error", reject);
    request.setTimeout(120000, () => {
      const error = new Error(`Timeout while requesting ${url}`);
      error.retryable = true;
      request.destroy(error);
    });
  });
}

async function retry(operation, label, maxAttempts = 6) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryableCode = ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"].includes(error.code);
      const retryable = error.retryable || retryableCode || error.statusCode === 429 || error.statusCode >= 500;
      if (!retryable || attempt === maxAttempts) throw error;

      const retryAfterSeconds = Number(error.retryAfter);
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(10000, retryAfterSeconds * 1000)
        : Math.min(60000, 5000 * attempt * attempt);
      console.warn(`${label} throttled; retrying in ${Math.round(delayMs / 1000)}s (${attempt}/${maxAttempts})`);
      await sleep(delayMs);
    }
  }
}

async function requestJson(url) {
  const text = await retry(() => requestText(url), "Commons API");
  return JSON.parse(text);
}

function downloadFileOnce(url, filePath) {
  return new Promise((resolve, reject) => {
    const request = requestModule(url).get(
      url,
      {
        headers: {
          "User-Agent": userAgent,
          Accept: "*/*",
        },
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
          response.resume();
          downloadFileOnce(new URL(response.headers.location, url).toString(), filePath).then(resolve, reject);
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
  const tempPath = `${filePath}.part`;
  await retry(async () => {
    await fs.rm(tempPath, { force: true });
    try {
      await downloadFileOnce(url, tempPath);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }, "Download");
}

function pickBinary(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  return path.join(rootDir, "node_modules", "@remotion", "compositor-win32-x64-msvc", exe);
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
  await sleep(source.type === "video" ? 3500 : 1500);
  return filePath;
}

function frameTimestamps(durationSec) {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec >= 4.8) {
    return ["00:00:00.5", "00:00:02", "00:00:04"];
  }

  const end = Math.max(0.3, durationSec - 0.35);
  const points = [0.25, end / 2, end]
    .map((point) => Math.max(0.1, Math.min(point, end)))
    .map((point) => Number(point.toFixed(2)));
  return Array.from(new Set(points)).map((point) => point.toFixed(2));
}

async function createVideoFrames(source, filePath, durationSec) {
  const ffmpeg = pickBinary("ffmpeg");
  const thumbnailName = `${source.id}.jpg`;
  const thumbnailPath = path.join(thumbnailDir, thumbnailName);
  const keyframes = [];

  try {
    await run(ffmpeg, ["-y", "-ss", "00:00:01", "-i", filePath, "-frames:v", "1", "-vf", "scale=480:-1", thumbnailPath]);
  } catch (error) {
    console.warn(`Thumbnail extraction failed for ${source.id}: ${error.message}`);
  }

  for (const [index, timestamp] of frameTimestamps(durationSec).entries()) {
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

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function licenseFromMetadata(metadata) {
  return stripHtml(metadata?.LicenseShortName?.value || metadata?.UsageTerms?.value || "Wikimedia Commons");
}

function authorFromMetadata(metadata) {
  const author = stripHtml(metadata?.Artist?.value || metadata?.Credit?.value || "");
  return author || "Wikimedia Commons contributor";
}

function isAllowedLicense(license) {
  const value = license.toLowerCase();
  if (value.includes("noncommercial") || value.includes("nc ")) return false;
  return (
    value.includes("cc0")
    || value.includes("public domain")
    || value.includes("pd")
    || value.includes("cc by")
  );
}

function uniqueTags(tags) {
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const clean = String(tag).trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result.slice(0, 12);
}

function hashText(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);
}

function slugify(text) {
  const slug = String(text)
    .replace(/^File:/i, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return slug || hashText(text);
}

function extensionForUrl(url, mime, fallbackType) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  if (ext && ext.length <= 8) return ext;
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "video/webm") return ".webm";
  if (mime === "application/ogg") return ".ogv";
  return fallbackType === "video" ? ".webm" : ".jpg";
}

function sourceUrlForPage(page, imageInfo) {
  return imageInfo.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title).replace(/%3A/g, ":")}`;
}

async function searchCommons(profileDef, type) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: profileDef.query,
    gsrnamespace: "6",
    gsrlimit: String(searchLimitPerProfile),
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
  });

  if (type === "image") params.set("iiurlwidth", "1280");

  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  const data = await requestJson(url);
  await sleep(1200);

  const pages = Object.values(data.query?.pages ?? {});
  const sources = [];

  for (const page of pages) {
    const imageInfo = page.imageinfo?.[0];
    if (!imageInfo) continue;

    const mime = String(imageInfo.mime || "");
    const license = licenseFromMetadata(imageInfo.extmetadata);
    if (!isAllowedLicense(license)) continue;

    if (type === "image" && !mime.startsWith("image/")) continue;
    if (type === "video" && !(mime.startsWith("video/") || mime === "application/ogg")) continue;
    if (type === "video" && Number(imageInfo.size || 0) > maxVideoBytes) continue;

    const downloadUrl = type === "image"
      ? imageInfo.thumburl || imageInfo.url
      : imageInfo.url;
    if (!downloadUrl) continue;

    const sourceUrl = sourceUrlForPage(page, imageInfo);
    const hash = hashText(sourceUrl);
    const ext = extensionForUrl(downloadUrl, mime, type);
    const fileSlug = `${profileDef.id}-${slugify(page.title)}-${hash}`;
    const labelNumber = sources.length + 1;

    sources.push({
      id: `commons-${type}-${profileDef.id}-${hash}`,
      name: `${profileDef.label} ${String(labelNumber).padStart(2, "0")}`,
      type,
      fileName: `${fileSlug}${ext}`,
      downloadUrl,
      sourceUrl,
      license,
      author: authorFromMetadata(imageInfo.extmetadata),
      tags: uniqueTags(profileDef.tags),
      summary: `${profileDef.label}公开样例素材，已按商业 IP 批量剪辑场景预置标签。`,
      matchScore: type === "video" ? 78 : 82,
      discoveredBy: profileDef.query,
    });
  }

  return sources;
}

function pushUnique(target, candidates, seenSourceUrls, limit) {
  for (const candidate of candidates) {
    if (target.length >= limit) break;
    if (seenSourceUrls.has(candidate.sourceUrl)) continue;
    seenSourceUrls.add(candidate.sourceUrl);
    target.push(candidate);
  }
}

async function discoverSources() {
  const sources = [...curatedSources];
  const seenSourceUrls = new Set(sources.map((source) => source.sourceUrl));
  const targetVideos = Math.max(targetVideoCount, curatedSources.filter((source) => source.type === "video").length);
  const targetImages = Math.max(targetAssetCount - targetVideos, curatedSources.filter((source) => source.type === "image").length);
  const imageSources = sources.filter((source) => source.type === "image");
  const videoSources = sources.filter((source) => source.type === "video");

  for (const profileDef of imageProfiles) {
    if (imageSources.length >= targetImages) break;
    console.log(`Searching images: ${profileDef.query}`);
    const candidates = await searchCommons(profileDef, "image");
    pushUnique(imageSources, candidates, seenSourceUrls, targetImages);
  }

  for (const profileDef of videoProfiles) {
    if (videoSources.length >= targetVideos) break;
    console.log(`Searching videos: ${profileDef.query}`);
    const candidates = await searchCommons(profileDef, "video");
    pushUnique(videoSources, candidates, seenSourceUrls, targetVideos);
  }

  if (imageSources.length + videoSources.length < targetAssetCount) {
    for (const profileDef of imageProfiles) {
      if (imageSources.length + videoSources.length >= targetAssetCount) break;
      const expandedProfile = {
        ...profileDef,
        query: profileDef.query.replace(" CC0", ""),
      };
      console.log(`Searching fallback images: ${expandedProfile.query}`);
      const candidates = await searchCommons(expandedProfile, "image");
      pushUnique(imageSources, candidates, seenSourceUrls, targetAssetCount - videoSources.length);
    }
  }

  return [...imageSources, ...videoSources].slice(0, Math.max(targetAssetCount, imageSources.length + videoSources.length));
}

async function createAsset(source) {
  const filePath = await ensureFile(source);
  const stat = await fs.stat(filePath);
  const url = `/samples/commons/${source.fileName}`;
  const probe = await probeMedia(filePath);
  const frames = source.type === "video"
    ? await createVideoFrames(source, filePath, probe.durationSec)
    : { thumbnailUrl: url, keyframes: [url] };

  return {
    id: source.id,
    name: source.name,
    type: source.type,
    duration: formatDuration(probe.durationSec, source.type),
    orientation: inferOrientation(probe.width, probe.height),
    tags: uniqueTags(source.tags),
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
      visionStatus: "公开样例素材已自动入库并人工规则预打标签，可接入本地视觉模型后再次分析。",
      visionProvider: source.discoveredBy ? "commons-api-seed" : "manual-public-seed",
      summary: source.summary,
      analyzedAt: new Date().toISOString(),
    },
    license: source.license,
    sourceUrl: source.sourceUrl,
    author: source.author,
    seedBatch: batchId,
    discoveredBy: source.discoveredBy,
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
    `Seed batch: ${batchId}`,
    `Asset count: ${assets.length}`,
    `Auto-discovered video size limit: ${Math.round(maxVideoBytes / 1024 / 1024)}MB per video`,
    "",
    "| Asset | Type | License | Author | Source | Local file |",
    "| --- | --- | --- | --- | --- | --- |",
    ...assets.map((asset) =>
      `| ${asset.name} | ${asset.type} | ${asset.license} | ${asset.author} | ${asset.sourceUrl} | ${asset.url} |`,
    ),
    "",
    "Run `npm run assets:seed` from the `platform` directory to recreate this local sample library.",
    "",
  ];

  await fs.writeFile(attributionFile, lines.join("\n"), "utf8");
}

async function cleanupUnreferencedFiles(assets) {
  const allowedSampleFiles = new Set([
    "ATTRIBUTION.md",
    "manifest.json",
    ...assets.map((asset) => path.basename(asset.fileName)),
  ]);
  const allowedThumbnailFiles = new Set(
    assets
      .map((asset) => asset.thumbnailUrl)
      .filter((url) => typeof url === "string" && url.includes("/thumbnails/"))
      .map((url) => path.basename(url)),
  );
  const allowedKeyframeFiles = new Set(
    assets
      .flatMap((asset) => asset.analysis?.keyframes ?? [])
      .filter((url) => typeof url === "string" && url.includes("/keyframes/"))
      .map((url) => path.basename(url)),
  );

  const cleanupDir = async (dir, allowedFiles) => {
    const resolvedDir = path.resolve(dir);
    if (!resolvedDir.startsWith(path.resolve(samplesDir))) {
      throw new Error(`Refusing to clean outside sample directory: ${resolvedDir}`);
    }

    const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || allowedFiles.has(entry.name)) continue;
      await fs.rm(path.join(resolvedDir, entry.name), { force: true });
    }
  };

  await cleanupDir(samplesDir, allowedSampleFiles);
  await cleanupDir(thumbnailDir, allowedThumbnailFiles);
  await cleanupDir(keyframeDir, allowedKeyframeFiles);
}

async function main() {
  await fs.mkdir(samplesDir, { recursive: true });
  await fs.mkdir(thumbnailDir, { recursive: true });
  await fs.mkdir(keyframeDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  const sources = await discoverSources();
  console.log(`Resolved ${sources.length} source assets (${sources.filter((source) => source.type === "video").length} videos).`);

  const seededAssets = [];
  const failedAssets = [];
  for (const [index, source] of sources.entries()) {
    console.log(`[${index + 1}/${sources.length}] ${source.type}: ${source.name}`);
    try {
      seededAssets.push(await createAsset(source));
    } catch (error) {
      failedAssets.push({
        id: source.id,
        name: source.name,
        type: source.type,
        sourceUrl: source.sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      console.warn(`Skipping ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(5000);
    }
  }

  const existingAssets = await readExistingAssets();
  const preservedAssets = existingAssets.filter((asset) => asset.seedBatch !== batchId);
  const nextAssets = [...preservedAssets, ...seededAssets];

  await fs.writeFile(assetsFile, JSON.stringify(nextAssets, null, 2), "utf8");
  await fs.writeFile(
    manifestFile,
    JSON.stringify(
      {
        batchId,
        targetAssetCount,
        targetVideoCount,
        maxVideoBytes,
        generatedAt: new Date().toISOString(),
        assets: seededAssets,
        failedAssets,
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeAttribution(seededAssets);
  await cleanupUnreferencedFiles(seededAssets);

  console.log(`Seeded ${seededAssets.length} public sample assets.`);
  if (failedAssets.length > 0) console.log(`Skipped ${failedAssets.length} failed assets.`);
  console.log(`Assets JSON: ${assetsFile}`);
  console.log(`Attribution: ${attributionFile}`);
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === executedPath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
