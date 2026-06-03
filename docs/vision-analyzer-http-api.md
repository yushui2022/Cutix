# Cutix 本地视觉打标 API 对接契约

Cutix 上传视频后会先用 FFmpeg 抽关键帧。配置本地视觉模型服务后，`/api/assets/analyze` 会把这些关键帧提交给视觉服务，由视觉服务返回场景、人物、产品、镜头类型等标签。

## 1. 启用方式

在运行 `platform` 时设置任一环境变量：

```bash
CUTIX_VISION_ANALYZER_URL=http://127.0.0.1:7861/analyze
```

兼容旧变量名：

```bash
VISION_MODEL_ENDPOINT=http://127.0.0.1:7861/analyze
```

不配置时，Cutix 不会伪造视觉标签，只会在素材上显示“未配置本地视觉模型服务，已保留关键帧等待打标”。

## 2. 请求结构

视觉服务会收到 `POST` 请求：

```json
{
  "asset": {
    "id": "asset-id",
    "name": "门店人流素材",
    "type": "video",
    "tags": ["视频", "B-roll", "门店"],
    "orientation": "9:16",
    "duration": "8.4s"
  },
  "frames": [
    {
      "url": "/uploads/keyframes/asset-id-1.jpg",
      "path": "C:\\Users\\xiaoy\\Desktop\\cutix\\platform\\public\\uploads\\keyframes\\asset-id-1.jpg"
    }
  ]
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `asset` | 当前素材的基础信息和已有标签 |
| `frames[].url` | 前端可访问的关键帧 URL |
| `frames[].path` | 本机绝对路径，适合本地视觉模型直接读取 |

## 3. 返回结构

视觉服务返回：

```json
{
  "provider": "local-qwen-vl",
  "summary": "门店内顾客排队，适合餐饮招商案例证明段落。",
  "tags": ["门店", "人流", "顾客", "案例", "证明", "餐饮"]
}
```

Cutix 会把 `tags` 合并进素材标签，并在素材卡上显示 `summary`。如果没有返回标签，Cutix 会保留原标签并显示“本地视觉模型已分析，未返回新标签”。

## 4. 推荐实现

建议用本地 FastAPI 包一层视觉模型：

1. 接收上述 `POST` 请求。
2. 读取 `frames[].path`。
3. 调用本地多模态模型识别场景、人物、产品、镜头类型和用途。
4. 返回 `summary` 和标准化标签。

标签最好落在 Cutix 标签体系里：场景、人物、产品、情绪、镜头类型、用途、IP、平台。
