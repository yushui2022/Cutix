import assert from "node:assert/strict";
import path from "node:path";

import {
  fallbackTagsFromMetadata,
  normalizeTags,
  normalizeVisionResult,
  parseVisionModelResponse,
  resolveFramePath,
} from "./vision-analyzer-http-service.mjs";

const parsed = parseVisionModelResponse(
  '```json\n{"tags":["门店","客流","#招商","门店"],"summary":"门店高峰期客流画面","provider":"unit-test"}\n```',
  "fallback-provider",
);

assert.deepEqual(parsed.tags, ["门店", "客流", "招商"], "model tags are normalized");
assert.equal(parsed.summary, "门店高峰期客流画面", "model summary is parsed");
assert.equal(parsed.provider, "unit-test", "model provider is preserved");

const embeddedJson = parseVisionModelResponse(
  'analysis result: {"tags":["产品","特写"],"summary":"产品展示镜头"}',
  "fallback-provider",
);
assert.deepEqual(embeddedJson.tags, ["产品", "特写"], "embedded JSON is extracted");

assert.deepEqual(normalizeTags(["#产品", " 产品 ", "转化", ""]), ["产品", "转化"], "tags are deduplicated");

const normalized = normalizeVisionResult({ tags: "门店,人流,招商", summary: "摘要" }, "fallback-provider");
assert.deepEqual(normalized.tags, ["门店", "人流", "招商"], "comma separated tags are supported");

const fallbackTags = fallbackTagsFromMetadata({
  asset: {
    name: "restaurant_store_customer_flow.mp4",
    type: "video",
    orientation: "9:16",
    tags: ["招商"],
  },
});
assert.deepEqual(fallbackTags, ["招商", "门店", "客流", "商业IP", "视频", "竖屏"], "metadata fallback tags");

const publicRoot = path.resolve(process.cwd(), "public");
const allowedPath = path.join(publicRoot, "uploads", "frame.jpg");
assert.equal(resolveFramePath({ path: allowedPath }), allowedPath, "public frame path is allowed");

assert.throws(
  () => resolveFramePath({ path: path.resolve(process.cwd(), "..", "secret.jpg") }),
  /outside allowed roots/u,
  "outside frame path is blocked",
);

console.log("[vision-analyzer:selftest] 7 checks passed");
