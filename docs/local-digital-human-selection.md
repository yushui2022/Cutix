# 本地数字人选型说明

更新时间：2026-06-05

## 1. 结论

Cutix 的正式交付链路只接受本地数字人服务，不依赖 HeyGen、D-ID、Synthesia 等云端数字人 API。数字人模块必须通过 Cutix 的统一 `/api/digital-human` Provider 契约接入，输入是每个分镜的 `audioPath`、`avatarPath`、`sceneId`、`durationMs` 和 IP 角色信息，输出是可被 Remotion 合成的 `videoUrl` 或 `alphaVideoUrl`。

当前推荐路线：

| 优先级 | 项目 | 用途 | 是否一期主链路 |
|---|---|---|---|
| P0 | Duix-Avatar / HeyGem | 平台型本地数字人服务，负责第一期验收里的本地数字人口播生成 | 是，优先验证 |
| P0 保底 | MuseTalk + CosyVoice | 本地 TTS + 本地口型驱动，输出分镜口播片段 | 是，作为自研保底 |
| P1 | LatentSync | 高质量 lip-sync provider 备选 | 否，作为替换 provider |
| P2 | HunyuanVideo-Avatar / OmniAvatar | 高质量生成式数字人研究项 | 否 |
| P2 | EchoMimicV2 / LivePortrait | 表情、头动、半身动效增强 | 否 |
| P3 | Wav2Lip / SadTalker | 应急或实验参考 | 否 |

## 2. 为什么主线不是“最炫”的生成式数字人

客户要的是商业 IP 视频批量生产工厂，不是只跑一条 demo。第一期的核心指标是：

1. 能在客户服务器本地部署。
2. 能连续生成几十到几百条分镜片段。
3. 失败能定位到具体 scene 并重试。
4. 输出能稳定合成到 Remotion 画面里。
5. 不把 Cutix 绑定到单个模型或云平台。

HunyuanVideo-Avatar、OmniAvatar 这类生成式数字人项目画面潜力更强，但通常更吃显存、速度更慢、授权边界和批量吞吐要实测。它们适合二期做效果升级，不适合现在作为交付主线。

## 3. 一期主线 A：Duix-Avatar / HeyGem

老板要求数字人本地化部署后，Duix-Avatar 更适合作为第一期验收方案。原因不是它一定比所有 lip-sync 模型画质更强，而是它更接近“本地数字人平台”的交付形态：本地 Docker 服务、角色/声音能力、生成 API 和本地结果文件都更容易让客户理解。

在 Cutix 中的接入方式：

```text
Cutix /api/digital-human
  -> 本地 HTTP Provider
  -> duix-adapter（如果 Duix 原生字段与 Cutix 契约不一致）
  -> Duix 本地服务
  -> 返回 videoUrl / alphaVideoUrl / statusUrl
  -> Remotion 合成完整商业 IP 视频
```

系统设置里已经提供 `Duix 本地` 预设，默认地址：

```text
http://127.0.0.1:8789/generate
```

该地址是 Cutix 的 `duix-adapter`，adapter 默认再转发到 Duix 原生 `http://127.0.0.1:8383/easy/submit` 和 `http://127.0.0.1:8383/easy/query`。

验证重点：

1. Duix 本地服务能否在客户 GPU 服务器稳定启动。
2. Cutix 是否能通过本地 HTTP 调用触发生成。
3. 单段数字人口播是否能返回本地可访问 MP4。
4. 输出是否方便抠图，或是否能通过绿幕/透明通道进入 Remotion。
5. 连续生成 20-50 个 scene 时，队列、错误、磁盘增长是否可控。
6. 商业授权是否覆盖客户实际使用规模。

## 4. 一期主线 B：MuseTalk + CosyVoice

### MuseTalk

定位：本地 lip-sync / talking head provider。

输入：

- `audioPath`：Cutix TTS 生成的 WAV。
- `avatarPath`：IP 绑定的数字人参考视频，优先使用绿幕半身口播素材。
- `sceneId` / `durationMs`：用于输出命名和时长校验。

输出：

- 源口播片段 MP4。
- 可选 alpha WebM，供 Remotion 叠加到素材画面上。

接入方式：

- Cutix 当前已经提供 `npm run digital-human:musetalk-service`。
- 默认服务地址：`http://127.0.0.1:8788/generate`。
- 该服务必须失败即失败，不能静默生成测试占位片段。

### CosyVoice

定位：本地 TTS / 声音克隆 provider。

输入：

- LLM 生成的每个分镜口播文案。
- IP 绑定的声音标识或声音样本。

输出：

- WAV 音频。
- 字幕/音素时间轴，供 Remotion 字幕高亮和 MuseTalk 口型驱动使用。

备注：

- 当前 Cutix 的 `/api/tts` 已经按本地 FastAPI 方式抽象，后续可以从 CosyVoice 2 切到 CosyVoice 3 或其他本地 TTS。
- 声音克隆必须让客户提供有授权的声音样本，不能随意克隆第三方声音。

## 5. 高质量备选：LatentSync

LatentSync 适合作为 MuseTalk 的质量替换项，而不是重新设计系统。它应该接入同一套 Provider 契约：

```text
audioPath + avatarPath + sceneId
  -> LatentSync service
  -> source MP4
  -> FFmpeg chromakey / segmentation
  -> alpha WebM
  -> Remotion
```

验证重点：

1. 同一头像、同一音频下的口型准确度是否明显优于 MuseTalk。
2. 单段生成速度和显存占用是否适合批量生产。
3. Windows/Ubuntu/NVIDIA 驱动部署是否可复现。
4. 输出片段是否方便做绿幕/透明通道处理。

## 6. 暂不进一期的项目

### HunyuanVideo-Avatar / OmniAvatar

这些项目更适合追求高质量生成式 avatar、身体动作、表情和镜头自然度。短期问题是：

- 推理成本更高。
- 生成速度和批量稳定性不确定。
- 授权、模型权重和客户商用边界要逐条复核。
- 输出往往是完整视频，不一定天然适合 Cutix 的分层合成。

结论：二期研究，不进入当前交付承诺。

### EchoMimicV2 / LivePortrait

适合做头像/半身动效增强，例如头动、表情、微动作。它们可以让数字人更自然，但不能替代 TTS、lip-sync、素材合成和任务队列。

结论：作为增强模块，不作为主链路。

### Wav2Lip / SadTalker

老牌项目适合实验、兜底和对比，但商业短视频里容易暴露分辨率、清晰度、稳定性或视觉自然度问题。

结论：不作为客户主方案。

## 7. 近期落地动作

1. 准备一个客户授权的绿幕半身 avatar 样例。
2. 优先部署 Duix-Avatar 本地服务，跑通 `Cutix -> Duix -> Remotion -> MP4`。
3. 如果 Duix 原生接口不兼容 Cutix 契约，补一个 `duix-adapter` 服务。
4. 并行跑通 `CosyVoice -> MuseTalk service -> Cutix /api/digital-human -> Remotion -> MP4`，作为自研保底。
5. 连续生成 20 个数字人 scene，记录平均耗时、失败率、显存峰值、输出体积。
6. 如果 Duix/MuseTalk 质量不能验收，再接 LatentSync Provider 做 A/B 测试。
