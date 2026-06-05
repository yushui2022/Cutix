# MuseTalk 本地数字人 HTTP 服务

这个服务是 Cutix 的本地化数字人主链路适配器。它把 Cutix 生成的每段 TTS 音频和 IP 角色参考素材传给本机 MuseTalk，生成口播数字人片段，并按 Cutix 的数字人 HTTP API 契约返回 `videoUrl` / `alphaVideoUrl`。

它不调用云 API，也不会生成测试占位片段。MuseTalk 环境、模型权重或角色素材缺失时，服务会直接返回失败，Cutix 会阻止正式成片提交。

## 1. 启动方式

在 `platform/` 目录执行：

```powershell
npm run digital-human:musetalk-service
```

默认监听：

```text
http://127.0.0.1:8788/generate
```

健康检查：

```text
http://127.0.0.1:8788/health
```

健康检查会返回服务是否可生产以及每个本地依赖的状态：

```json
{
  "service": "cutix-musetalk-http-service",
  "ok": false,
  "generateEndpoint": "http://127.0.0.1:8788/generate",
  "healthEndpoint": "http://127.0.0.1:8788/health",
  "museTalkRoot": "C:\\Users\\xiaoy\\Desktop\\cutix\\external\\musetalk",
  "version": "v15",
  "checks": [
    {"key": "musetalkRoot", "label": "MuseTalk 根目录", "status": "pass", "message": "可读取"},
    {"key": "unetModel", "label": "MuseTalk UNet 权重", "status": "fail", "message": "不可读取或不存在"}
  ]
}
```

Cutix 控制台的「数字人接入检查」会优先读取这个 `/health`，并把 Python、FFmpeg、MuseTalk 根目录、模型权重、配置文件、输出目录可写性逐项展开。如果服务没有实现 `/health`，系统才会退回到通用 HTTP endpoint 探测。

然后在 Cutix Web 控制台的「数字人接入」里配置：

| 字段 | 值 |
|---|---|
| 接入方式 | 本地 HTTP 数字人服务 |
| 数字人服务地址 | `http://127.0.0.1:8788/generate` |
| 数字人参考素材路径 | 本机绝对路径，例如 `C:\avatars\wang-green.mp4` |

也可以直接把数字人参考素材上传到 Cutix 素材库。文件名里包含 `avatar`、`musetalk`、`talking`、`数字人`、`口播`、`绿幕` 等关键词的视频或图片，会被自动归为 `avatar` 类型并保存本地绝对路径；在 IP/品牌配置里可以从素材库 avatar 候选一键绑定到当前数字人角色。

## 2. 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MUSETALK_SERVICE_HOST` | `127.0.0.1` | HTTP 服务监听地址 |
| `MUSETALK_SERVICE_PORT` | `8788` | HTTP 服务端口 |
| `MUSETALK_ROOT` | `../external/musetalk` | MuseTalk 项目目录，基于 `platform/` 运行目录解析 |
| `MUSETALK_PYTHON` | `python` | MuseTalk Python 环境 |
| `MUSETALK_VERSION` | `v15` | MuseTalk 推理版本 |
| `MUSETALK_UNET_MODEL_PATH` | `models/musetalkV15/unet.pth` | 相对 MuseTalk 根目录的模型路径 |
| `MUSETALK_UNET_CONFIG` | `models/musetalkV15/musetalk.json` | 相对 MuseTalk 根目录的配置路径 |
| `MUSETALK_AVATAR_PATH` | 空 | 默认角色参考素材；前端 IP 角色路径优先 |
| `FFMPEG_PATH` | `node_modules/ffmpeg-static/ffmpeg(.exe)` | FFmpeg 路径 |
| `MUSETALK_CHROMA_COLOR` | `0x00FF00` | 抠绿颜色 |
| `MUSETALK_CHROMA_SIMILARITY` | `0.18` | 抠绿相似度 |
| `MUSETALK_CHROMA_BLEND` | `0.08` | 抠绿混合 |

## 3. 请求格式

Cutix 会向 `/generate` 发送：

```json
{
  "sceneId": "hook",
  "role": "hook",
  "layout": "full_dh",
  "text": "这段数字人需要说的话",
  "audioUrl": "/output/tts/clip.wav",
  "audioPath": "C:\\Users\\xiaoy\\Desktop\\cutix\\platform\\public\\output\\tts\\clip.wav",
  "durationMs": 5200,
  "brandId": "wang",
  "brandName": "老王餐饮",
  "roleName": "老王口播数字人",
  "voiceId": "wang-default",
  "avatarPath": "C:\\avatars\\wang-green.mp4",
  "alpha": true,
  "chromaKey": {
    "color": "#00FF00",
    "similarity": 0.18,
    "blend": 0.08
  }
}
```

## 4. 返回格式

成功：

```json
{
  "status": "completed",
  "jobId": "dh_1780000000000_abcd1234",
  "sceneId": "hook",
  "provider": "musetalk-local-http",
  "videoUrl": "/output/digital-human/dh_1780000000000_abcd1234-hook.mp4",
  "sourceVideoUrl": "/output/digital-human/dh_1780000000000_abcd1234-hook.mp4",
  "alphaVideoUrl": "/output/digital-human/dh_1780000000000_abcd1234-hook-alpha.webm",
  "alpha": true,
  "durationMs": 5200
}
```

失败：

```json
{
  "status": "failed",
  "error": "avatarPath or MUSETALK_AVATAR_PATH is required"
}
```

## 5. 交付注意事项

1. 角色参考素材最好是绿幕半身口播视频，便于输出透明 WebM。
2. 如果角色参考素材没有绿幕，服务仍会返回 `videoUrl`，但 `alphaVideoUrl` 可能为空或抠像效果差。
3. MuseTalk 输出失败时不要 fallback 到假人，占位片段不能进入客户交付成片。
4. 批量生产时建议单独运行该服务，并由 Cutix Render Worker 负责排队，避免多个 GPU 任务抢占同一张显卡。
