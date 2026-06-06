# Cutix 数字人 HTTP API 对接契约

Cutix 的 `/api/digital-human` 会把每个需要数字人的分镜单独提交给外部数字人服务。外部服务可以同步返回视频，也可以先返回 job，再由 Cutix 轮询状态。

## 1. 生成请求

在系统设置里配置的 `HTTP Endpoint` 会收到 `POST` 请求：

```json
{
  "sceneId": "hook",
  "role": "hook",
  "layout": "full_dh",
  "text": "这段数字人需要说的话",
  "audioUrl": "/output/tts/clip.wav",
  "audioPath": "C:\\Users\\...\\platform\\public\\output\\tts\\clip.wav",
  "durationMs": 5200,
  "brandId": "wang",
  "brandName": "老王餐饮",
  "roleName": "老王口播数字人",
  "voiceId": "wang-default",
  "avatarPath": "C:\\avatars\\wang.mp4"
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `sceneId` | 分镜 ID，用于回填到成片 Timeline |
| `role` | 分镜角色，例如 `hook`、`pain`、`solution`、`proof`、`cta` |
| `layout` | LLM 编排出的画面布局，例如 `full_dh`、`dh_top_broll_bottom` |
| `text` | 该段数字人口播文案 |
| `audioUrl` | Cutix 内部可访问的音频 URL |
| `audioPath` | 本机绝对音频路径，适合本地 MuseTalk/FastAPI 直接读取 |
| `durationMs` | 该段音频时长 |
| `brandId` / `brandName` | 当前商业 IP，用于数字人服务选择角色 |
| `roleName` | 当前 IP 绑定的数字人角色名称 |
| `voiceId` | 当前 IP 绑定的声音/音色标识 |
| `avatarPath` | 当前 IP 绑定的角色参考素材路径；建议使用素材库上传后保存的本机绝对路径，便于本地数字人服务直接读取；为空时数字人服务可使用自己的默认角色 |

如果系统设置里保存了 API Key，Cutix 会带：

```http
Authorization: Bearer <apiKey>
```

## 2. 同步返回

数字人服务可以直接返回视频：

```json
{
  "videoUrl": "http://127.0.0.1:7860/output/hook.mp4",
  "alphaVideoUrl": "http://127.0.0.1:7860/output/hook-alpha.webm",
  "sourceVideoUrl": "http://127.0.0.1:7860/output/hook.mp4",
  "durationMs": 5200,
  "alpha": true
}
```

要求：

- `videoUrl` 或 `alphaVideoUrl` 至少返回一个。
- 有透明通道时优先返回 `alphaVideoUrl`。
- 如果只返回本地 `/output/...mp4` 且请求未关闭 alpha，Cutix 会自动尝试用 FFmpeg chromakey 转出 VP9 alpha WebM；远程 URL 不会被本地兜底处理。
- `sourceVideoUrl` 可选，不传时 Cutix 会使用 `videoUrl`。
- `durationMs` 可选，不传时 Cutix 使用请求里的音频时长。

## 3. 异步返回

如果数字人服务需要排队，可以先返回轮询地址：

```json
{
  "jobId": "dh-job-001",
  "statusUrl": "http://127.0.0.1:7860/jobs/dh-job-001"
}
```

也支持字段名 `pollUrl`。`statusUrl` / `pollUrl` 可以是绝对 URL，也可以是相对 URL。

Cutix 会按以下环境变量轮询：

| 环境变量 | 默认值 | 说明 |
|---|---:|---|
| `DIGITAL_HUMAN_HTTP_POLL_INTERVAL_MS` | `2000` | 轮询间隔 |
| `DIGITAL_HUMAN_HTTP_POLL_TIMEOUT_MS` | `600000` | 单段最长等待时间 |

状态接口返回完成时，结构和同步返回一致：

```json
{
  "status": "completed",
  "videoUrl": "http://127.0.0.1:7860/output/hook.mp4",
  "alphaVideoUrl": "http://127.0.0.1:7860/output/hook-alpha.webm",
  "durationMs": 5200
}
```

失败时返回：

```json
{
  "status": "failed",
  "error": "avatar not found"
}
```

支持的失败状态：`failed`、`error`、`canceled`、`cancelled`。

## 4. 交付规则

- HTTP API 或 MuseTalk 失败时，Cutix 不会静默 fallback 成测试占位片段。
- 测试占位只允许在前端显式测试使用。
- 含测试占位的数字人结果会标记 `productionReady = false`，前端禁止提交最终成片任务。
- 数字人接入检查会校验本机绝对 `avatarPath` 是否可读取；远程 URL 或非绝对路径会保留为提醒，由具体数字人服务自行解析。
- 本地 HTTP 数字人服务可只返回普通本地 MP4，由 Cutix 统一做 chromakey 透明通道兜底；生产中仍建议服务端尽量返回干净绿幕或原生 alpha。
- 当系统设置里的 HTTP endpoint 命中默认 `Duix Adapter` 或 `MuseTalk Service` 本地地址时，Web 生产就绪摘要会读取 `/api/digital-human-service/status`；服务离线会被标记为阻断项，不能只因为 endpoint 已保存就判断为可生产。

## 5. 推荐本地实现

老板要求本地化部署后，推荐把本地数字人服务分成两类接入：

- **Duix.Avatar / HeyGem 本地服务**：作为第一期验收优先方案。系统设置里可以套用 `Duix 本地` 预设，默认指向 Cutix adapter：`http://127.0.0.1:8789/generate`。adapter 接收 Cutix 的 `text/audioPath/avatarPath/voiceId`，默认转发到 Duix 原生 `http://127.0.0.1:8383/easy/submit`，再把 Duix 结果转换回 `videoUrl/alphaVideoUrl/statusUrl`。
- **MuseTalk 本地服务**：作为 Cutix 自研保底方案。它只负责 lip-sync 口播片段，不替代素材库、自动文案、分镜编排和 Remotion 合成。

### MuseTalk wrapper

生产落地时建议把 MuseTalk 包装成一个本地 FastAPI 服务：

1. 接收上述 `POST` 请求。
2. 根据 `brandId` / `roleName` / `voiceId` 找到对应角色和声音。
3. 把 `audioPath` 和 IP 对应的 `avatarPath` 投递给 MuseTalk。
4. 输出绿幕 MP4。
5. 可选：用 FFmpeg 或 RMBG 做透明通道 WebM。
6. 返回同步 `videoUrl/alphaVideoUrl`，或返回 `statusUrl` 让 Cutix 轮询。

当前仓库已提供一个无额外依赖的 Node 版本地服务脚本，可作为第一期 MuseTalk 本地化接入基线：

```powershell
cd platform
npm run digital-human:musetalk-service
```

默认生成接口：

```text
http://127.0.0.1:8788/generate
```

部署细节见：`docs/musetalk-local-service.md`。

### 连续生成压测

部署 Duix adapter、MuseTalk service 或其他本地数字人 Provider 后，先用统一 benchmark 脚本验证连续生成稳定性：

```powershell
cd platform
npm run digital-human:benchmark -- --endpoint http://127.0.0.1:8789/generate --audio C:\cutix-test\speech.wav --avatar C:\cutix-test\avatar-green.mp4 --count 20
```

报告会写入 `platform/data/digital-human/benchmarks/`，用于记录成功率、平均耗时、P95 耗时、输出文件大小和单个 scene 错误。详细说明见：`docs/digital-human-benchmark.md`。

### Duix adapter

Duix 本地服务建议通过 Cutix adapter 接入，而不是让 Cutix 直接依赖 Duix 原生字段：

```powershell
cd platform
npm run digital-human:duix-adapter
```

也可以在 Web 后台的系统设置里点击“启动 Duix Adapter”或“启动 MuseTalk 服务”。Web 启动的本地数字人服务会把状态和日志写到：

```text
platform/data/digital-human-services/
```

其中 `*.out.log` / `*.err.log` 用于排查服务启动失败、模型路径错误、端口占用或 Duix 原生接口不可达等问题；`*.json` 记录最近一次由 Web 启动的 PID、endpoint 和脚本名。这些文件属于本地运行数据，不应提交到 Git。

Web 后台会轮询：

```text
GET /api/digital-human-service/status
```

该接口会返回 Duix Adapter 和 MuseTalk Service 的默认 health 状态、最近一次 Web 启动 state，以及 stdout/stderr 的尾部内容。系统设置里的本地服务面板会直接显示在线/离线、PID、脚本名和最近日志片段。

默认生成接口：

```text
http://127.0.0.1:8789/generate
```

默认转发目标：

```text
http://127.0.0.1:8383/easy/submit
http://127.0.0.1:8383/easy/query
```

常用环境变量：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `DUIX_ADAPTER_PORT` | `8789` | adapter 监听端口 |
| `DUIX_API_BASE` | `http://127.0.0.1:8383` | Duix 本地视频服务地址 |
| `DUIX_SUBMIT_URL` | `${DUIX_API_BASE}/easy/submit` | Duix 提交接口 |
| `DUIX_QUERY_URL` | `${DUIX_API_BASE}/easy/query` | Duix 查询接口 |
| `DUIX_HEALTH_ALLOW_UNREACHABLE` | 空 | 仅调试用；设为 `1` 时 Duix 原生服务不可达只记 warn，否则阻断 Cutix 生产预检 |
| `DUIX_AVATAR_PATH` | 空 | 未从 IP 档案传入 `avatarPath` 时的默认角色视频 |
| `DUIX_AUDIO_HOST_DIR` / `DUIX_AUDIO_CONTAINER_DIR` | 空 | 需要把 Cutix 音频复制到 Duix Docker 映射目录时使用 |
| `DUIX_VIDEO_HOST_DIR` / `DUIX_VIDEO_CONTAINER_DIR` | 空 | 需要把角色视频复制到 Duix Docker 映射目录时使用 |
| `DUIX_RESULT_HOST_DIR` / `DUIX_RESULT_CONTAINER_DIR` | 空 | Duix 返回容器内结果路径时，用于映射回宿主机并复制到 Cutix 输出目录 |
| `DUIX_ARCHIVE_REMOTE_RESULT` | `1` | Duix 返回 HTTP/HTTPS 结果 URL 时，默认下载归档到 Cutix 输出目录；设为 `0` 时直接透传远程 URL |
| `DUIX_RESULT_DOWNLOAD_TIMEOUT_MS` | `600000` | 下载 Duix 远程结果视频的超时时间 |
| `DUIX_ALLOW_UNRESOLVED_RESULT` | 空 | 仅调试用；设为 `1` 时允许透传 Cutix 不可读的结果路径，生产不建议开启 |

adapter 查询 Duix 结果时会尽量兼容常见字段名，例如 `videoUrl`、`video_url`、`videoPath`、`resultUrl`、`downloadUrl`、`outputPath`、`filePath` 等；如果 Duix 返回嵌套对象或数组，adapter 也会递归查找这些字段。只有 URL、本地路径、`/output/...` 或带视频扩展名的字符串才会被当成成片结果，`result: "success"` 这类状态文本不会误判为视频地址。Duix 返回“已完成”但没有视频字段时，adapter 会明确返回失败；Duix 返回容器内结果路径但 Cutix 无法读取时，也会明确提示配置 `DUIX_RESULT_HOST_DIR/DUIX_RESULT_CONTAINER_DIR`，方便定位是 Duix 输出映射问题，而不是 Remotion 合成问题。
