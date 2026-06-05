# 本地数字人连续生成压测

更新时间：2026-06-05

这个脚本用于验证本地数字人 Provider 是否能承担 Cutix 的批量生产任务。它不评价最终画面审美，只回答几个交付问题：

1. 本地服务是否可达。
2. `/health` 是否就绪。
3. 连续提交多个分镜是否稳定。
4. 每段生成耗时是多少。
5. 返回的视频文件是否能被 Cutix 本地读取。
6. 失败是否有明确错误，能否定位到具体 scene。

## 1. 命令

```powershell
cd platform
npm run digital-human:benchmark -- `
  --endpoint http://127.0.0.1:8789/generate `
  --audio C:\cutix-test\speech.wav `
  --avatar C:\cutix-test\avatar-green.mp4 `
  --count 20
```

如果系统设置里已经保存了本地 HTTP Provider endpoint，可以省略 `--endpoint`：

```powershell
cd platform
npm run digital-human:benchmark -- `
  --audio C:\cutix-test\speech.wav `
  --avatar C:\cutix-test\avatar-green.mp4 `
  --count 20
```

## 2. 适用 Provider

该脚本直接调用 Cutix 数字人 HTTP Provider 契约，因此可以压测：

| Provider | endpoint 示例 | 说明 |
|---|---|---|
| Duix adapter | `http://127.0.0.1:8789/generate` | 一期验收优先链路 |
| MuseTalk service | `http://127.0.0.1:8788/generate` | 自研保底链路 |
| LatentSync wrapper | 自定义本地 URL | 后续 P1 质量替换链路 |

请求体沿用 `docs/digital-human-http-api.md`：

```json
{
  "sceneId": "dh-benchmark-...",
  "role": "benchmark",
  "layout": "full_dh",
  "text": "Cutix 本地数字人连续生成验收测试。1/20",
  "audioPath": "C:\\cutix-test\\speech.wav",
  "durationMs": 5000,
  "brandId": "benchmark",
  "brandName": "Cutix Benchmark",
  "roleName": "Cutix 本地数字人验收角色",
  "voiceId": "benchmark",
  "avatarPath": "C:\\cutix-test\\avatar-green.mp4"
}
```

## 3. 输出报告

默认报告路径：

```text
platform/data/digital-human/benchmarks/benchmark-<timestamp>.json
```

`platform/data/` 已被 `.gitignore` 忽略，报告不会进入 Git。

报告核心字段：

| 字段 | 说明 |
|---|---|
| `health` | Provider `/health` 探测结果 |
| `summary.count` | 总提交 scene 数 |
| `summary.passed` / `summary.failed` | 成功/失败数量 |
| `summary.successRate` | 成功率 |
| `summary.averageElapsedMs` | 平均生成耗时 |
| `summary.p95ElapsedMs` | P95 生成耗时 |
| `summary.totalOutputBytes` | 可读取输出文件总大小 |
| `results[]` | 每个 scene 的耗时、输出 URL、文件状态或错误 |

## 4. 一期验收建议

第一轮至少跑：

```powershell
npm run digital-human:benchmark -- --audio C:\cutix-test\speech.wav --avatar C:\cutix-test\avatar-green.mp4 --count 20
```

验收时重点看：

1. 20 个 scene 不能出现测试占位视频。
2. 失败必须返回明确错误，不能卡死。
3. 每个成功结果要有 `videoUrl` 或 `alphaVideoUrl`。
4. 如果返回本地 `/output/...mp4`，报告里的 `file.exists` 应为 `true`。
5. 平均耗时和 P95 要记录给客户，用于估算批量生产吞吐。
6. 磁盘增长要和 Worker 监控里的输出目录占用一起看。

## 5. 常见问题

### `/health` 返回 fail

默认会阻断压测。只有确认是在调试非标准服务时，才使用：

```powershell
npm run digital-human:benchmark -- --allow-unhealthy --endpoint http://127.0.0.1:8789/generate --audio C:\cutix-test\speech.wav
```

### Duix adapter 找不到音频或 avatar

检查：

1. `audioPath` 和 `avatarPath` 是否是宿主机绝对路径。
2. 如果 Duix 运行在 Docker 内，是否配置了 `DUIX_AUDIO_HOST_DIR` / `DUIX_AUDIO_CONTAINER_DIR`、`DUIX_VIDEO_HOST_DIR` / `DUIX_VIDEO_CONTAINER_DIR`。
3. Duix 原生服务 `/easy/query` 是否可达。

### 成功但报告里 `file.exists=false`

说明 Provider 返回的是远程 URL，或返回的本地路径没有映射到 Cutix 的 `platform/public/output/`。正式生产建议让 Provider 返回 Cutix 可访问的 `/output/...` 路径，方便 Remotion 和后处理继续消费。
