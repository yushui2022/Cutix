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
| `avatarPath` | 当前 IP 绑定的角色参考素材路径；为空时数字人服务可使用自己的默认角色 |

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

## 5. 推荐本地实现

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
