# Cutix 视觉打标 HTTP API 对接契约

Cutix 上传视频或图片后会先做本地元信息读取、缩略图生成和关键帧抽取。视觉打标服务只需要接收关键帧路径和素材元信息，返回标签、摘要和服务标识。

## 1. 配置入口

在 Web 后台打开「系统设置」 -> 「视觉打标服务」，填写本地 HTTP endpoint，例如：

```text
http://127.0.0.1:8890/analyze
```

也可以用环境变量覆盖后台配置：

```text
CUTIX_VISION_ANALYZER_URL=http://127.0.0.1:8890/analyze
CUTIX_VISION_ANALYZER_KEY=local-secret
```

环境变量优先级高于后台保存的 `platform/data/vision-config.json`。

### 本地参考服务

当前仓库提供了一个 OpenAI-compatible 本地视觉 analyzer wrapper，可接 Ollama、vLLM、Qwen-VL、InternVL 等客户内网视觉模型：

```powershell
cd platform
npm run vision:analyzer-service
```

默认 endpoint：

```text
http://127.0.0.1:8890/analyze
```

常用环境变量：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `VISION_ANALYZER_PORT` | `8890` | 本地 analyzer 监听端口 |
| `VISION_ANALYZER_BASE_URL` | `http://127.0.0.1:11434/v1` | 本地 OpenAI-compatible 视觉模型地址 |
| `VISION_ANALYZER_CHAT_URL` | `${VISION_ANALYZER_BASE_URL}/chat/completions` | 自定义 chat completions 地址 |
| `VISION_ANALYZER_MODEL` | `qwen2.5vl:7b` | 本地视觉模型名 |
| `VISION_ANALYZER_API_KEY` | 空 | 本地模型服务需要鉴权时使用 |
| `VISION_ANALYZER_MAX_FRAMES` | `4` | 单个素材最多发送的关键帧数量 |
| `VISION_ANALYZER_FRAME_ROOTS` | 空 | 额外允许读取的关键帧根目录，多个目录用系统 path delimiter 分隔 |
| `VISION_ANALYZER_RULES_ONLY` | 空 | 设为 `1` 时只用元数据规则补标签，不调用视觉模型 |

改动 analyzer JSON 解析、标签规则或路径白名单后，先跑：

```powershell
cd platform
npm run vision:analyzer-selftest
```

出于本地文件安全考虑，参考服务默认只读取 `platform/public` 下的关键帧。需要读取额外目录时使用 `VISION_ANALYZER_FRAME_ROOTS` 显式放行。

## 2. 请求格式

Cutix 会对 endpoint 发送 `POST` JSON：

```json
{
  "asset": {
    "id": "asset-id",
    "name": "门店客流",
    "type": "video",
    "tags": ["门店", "人流"],
    "orientation": "9:16",
    "duration": "12.4s"
  },
  "frames": [
    {
      "url": "/uploads/keyframes/asset-1.jpg",
      "path": "C:\\Users\\xiaoy\\Desktop\\cutix\\platform\\public\\uploads\\keyframes\\asset-1.jpg"
    }
  ]
}
```

如果配置了 API Key，Cutix 会带：

```http
Authorization: Bearer <apiKey>
```

## 3. 响应格式

视觉服务返回：

```json
{
  "tags": ["门店", "排队", "收银台", "高峰期", "餐饮招商"],
  "summary": "画面是餐饮门店高峰期客流和收银场景，可用于招商或转化率证明段落。",
  "provider": "local-qwen2.5-vl"
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `tags` | 字符串数组，Cutix 会和已有标签合并，最多保留 16 个 |
| `summary` | 可选，用于素材卡片展示和后续人工复核 |
| `provider` | 可选，记录本地视觉服务名称 |

## 4. 交付规则

- 视觉打标必须走本地服务或客户内网服务，不依赖云 API。
- endpoint 未配置时，Cutix 仍会保留上传、抽帧、人工标签和自动选材能力，只是不会补充视觉模型标签。
- 视觉模型失败时不会删除原有标签，素材仍可人工复核后启用。
- 服务返回的标签会进入素材库标签体系，并被 `/api/selection` 用于后续自动选材。
