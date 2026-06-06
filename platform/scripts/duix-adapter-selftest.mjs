import assert from "node:assert/strict";

import {
  completedStatus,
  errorField,
  failedStatus,
  isLikelyResultReference,
  progressField,
  resultField,
  statusField,
} from "./duix-http-adapter.mjs";

const resultCases = [
  {
    name: "top-level videoUrl",
    payload: { status: "completed", videoUrl: "http://127.0.0.1:8383/output/a.mp4" },
    expected: "http://127.0.0.1:8383/output/a.mp4",
  },
  {
    name: "nested data video_url",
    payload: { code: 0, data: { status: 2, video_url: "/output/duix/a.mp4" } },
    expected: "/output/duix/a.mp4",
  },
  {
    name: "nested array downloadUrl",
    payload: { data: { items: [{ result: "success" }, { downloadUrl: "https://example.test/result.webm" }] } },
    expected: "https://example.test/result.webm",
  },
  {
    name: "container output path",
    payload: { result: { output_path: "/app/output/result.mov" } },
    expected: "/app/output/result.mov",
  },
  {
    name: "ignore status-like result text",
    payload: { status: "completed", result: "success" },
    expected: "",
  },
];

for (const item of resultCases) {
  assert.equal(resultField(item.payload), item.expected, item.name);
}

assert.equal(statusField({ data: { task_status: "2" } }), 2, "numeric string status");
assert.equal(statusField({ result: { state: "FINISHED" } }), "finished", "normalized string status");
assert.equal(completedStatus(statusField({ status: "succeeded" })), true, "completed status");
assert.equal(failedStatus(statusField({ status_code: -1 })), true, "failed numeric status");
assert.equal(failedStatus(statusField({ jobStatus: "cancelled" })), true, "failed cancelled status");

assert.equal(errorField({ data: { detail: "avatar not found" } }), "avatar not found", "error detail");
assert.equal(progressField({ data: { progress: 0.42 } }), 0.42, "progress field");

assert.equal(isLikelyResultReference("success"), false, "status word is not a result");
assert.equal(isLikelyResultReference("https://example.test/a.mp4"), true, "remote video url");
assert.equal(isLikelyResultReference("C:\\duix\\outputs\\a.mp4"), true, "windows result path");

console.log(`[duix-adapter:selftest] ${resultCases.length + 9} checks passed`);
