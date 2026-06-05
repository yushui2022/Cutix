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
