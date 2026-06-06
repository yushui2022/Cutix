# 本地数字人选型说明

更新时间：2026-06-06

## 1. 结论

Cutix 的正式交付链路只接受本地数字人服务，不依赖 HeyGen、D-ID、Synthesia 等云端数字人 API。数字人模块必须通过 Cutix 的统一 `/api/digital-human` Provider 契约接入，输入是每个分镜的 `audioPath`、`avatarPath`、`sceneId`、`durationMs` 和 IP 角色信息，输出是可被 Remotion 合成的 `videoUrl` 或 `alphaVideoUrl`。

当前推荐路线：

| 优先级 | 项目 | 用途 | 是否一期主链路 |
|---|---|---|---|
| P0 | Duix-Avatar / HeyGem | 平台型本地数字人服务，负责第一期验收里的本地数字人口播生成 | 是，优先验证 |
| P0 保底 | MuseTalk + CosyVoice | 本地 TTS + 本地口型驱动，输出分镜口播片段 | 是，必须保留为自研保底 |
| P1 | LatentSync | 高质量 lip-sync provider 备选 | 否，作为替换 provider |
| P2 | LiveTalking / EchoMimicV2 / LivePortrait | 实时交互、表情、头动、半身动效增强 | 否 |
| P2 | HunyuanVideo-Avatar / OmniAvatar | 高质量生成式数字人研究项 | 否 |
| P3 | Wav2Lip / SadTalker | 应急或实验参考 | 否 |

老板要求本地化部署后，第一期不要再把云端数字人 API 当成生产方案。Cutix 的实际落地建议是“一条验收主线 + 一条自研保底 + 一个质量替换位”：

1. **验收主线：Duix-Avatar / HeyGem。** 优先用它证明客户服务器上可以部署一个本地数字人服务，并且 Cutix 能通过本地 HTTP 触发生成、拿回本地 MP4、继续做 Remotion 合成。
2. **自研保底：CosyVoice + MuseTalk。** 如果 Duix 授权、稳定性、画质或接口不满足客户要求，Cutix 仍然可以走本地 TTS + 本地口型驱动，保证不被某个平台卡死。
3. **质量替换：LatentSync。** 当 MuseTalk 口型或清晰度不够时，把 LatentSync 接到同一个 Provider 契约里做 A/B，不改变 Cutix 主系统。

因此当前不建议把 LiveTalking、EchoMimicV2、LivePortrait、SadTalker、Wav2Lip 作为第一期主线。它们可以做效果增强、实时互动研究或兜底对照，但不应该承担客户第一版批量视频工厂的核心验收。

当前执行口径：

1. **Duix-Avatar / HeyGem 是第一期默认接入对象。** 它最符合“客户服务器本地部署一个数字人服务”的交付叙事，Cutix 只负责调度、拿回片段和最终合成。
2. **MuseTalk + CosyVoice 是必须保留的本地保底。** 即使 Duix 跑通，也不能删除自研链路，否则项目会被单个平台的授权、稳定性和接口变化卡住。
3. **LatentSync 是同契约质量替换位。** 它不改变 Cutix 主流程，只在 MuseTalk 质量不足时作为第二个 lip-sync provider 做 A/B。
4. **Wav2Lip 不进入商用主线。** 它适合做技术对照，不适合交付给商业客户作为核心生产能力。
5. **LivePortrait / EchoMimic 只做增强模块。** 它们可以改善头动、表情或静态头像动效，但不能替代“文案 -> 语音 -> 数字人口播 -> Remotion 合成”的生产主链路。
6. **HeyGen 等云平台只做效果参考。** 云 API 不满足老板的本地化部署要求，不能让一键生产按钮因为云端配置而显示为可交付。

## 1.1 本地化部署硬规则

老板明确要求本地化部署后，数字人方案必须满足下面几条，否则不进入客户交付主链路：

1. 推理必须在客户本机或客户私有 GPU 服务器完成，不把口播文案、声音样本、头像素材、成片任务发到云端数字人平台。
2. 服务必须能通过本地 HTTP 或本地队列被 Cutix 调用，不能只提供 WebUI 手工操作。
3. 必须有健康检查，至少能检查模型权重、GPU/CPU 环境、FFmpeg、输入输出目录和当前队列状态。
4. 失败必须返回明确错误，不能静默生成测试占位片段。
5. 输出必须能进入 Remotion 分层合成，优先 `alphaVideoUrl`，至少也要能输出稳定绿幕或可抠图 MP4。
6. 商业使用前必须单独复核项目 LICENSE、模型权重条款、训练数据条款和客户声音/肖像授权。

因此 Cutix 不直接押注某一个“最强 demo”。Cutix 只认统一 Provider 契约：本地数字人服务接收 `audioPath + avatarPath + sceneId + roleName`，返回 `videoUrl/alphaVideoUrl/statusUrl`。后面无论换 Duix、MuseTalk、LatentSync 还是新模型，主系统都不重写。

## 1.2 项目取舍表

| 项目 | 地址 | 当前判断 |
|---|---|---|
| Duix-Avatar | https://github.com/duixcom/Duix-Avatar | 一期验收优先，本地平台型数字人服务 |
| MuseTalk | https://github.com/TMElyralab/MuseTalk | 一期自研保底，本地 lip-sync/talking-head；本地 checkout 显示代码 LICENSE 为 MIT |
| CosyVoice | https://github.com/FunAudioLLM/CosyVoice | 一期本地 TTS/声音克隆方向；本地 checkout 显示代码 LICENSE 为 Apache-2.0 |
| LatentSync | https://github.com/bytedance/LatentSync | P1 高质量口型替换 provider |
| LiveTalking | https://github.com/lipku/LiveTalking | P2 实时交互/流式数字人参考 |
| EchoMimicV2 | https://github.com/antgroup/echomimic_v2 | P2 表情/半身增强研究 |
| LivePortrait | https://github.com/KlingTeam/LivePortrait | P2 人像动效增强研究 |
| Wav2Lip | https://github.com/Rudrabha/Wav2Lip | P3 老牌 lip-sync 对照，不作客户主线 |
| SadTalker | https://github.com/OpenTalker/SadTalker | P3 老牌 talking-head 对照，不作客户主线 |

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

一句话判断：如果客户验收时问“这个数字人平台能不能部署在我们服务器上”，Duix/HeyGem 是第一回答；如果客户问“这个口型模型是不是我们自己可控”，MuseTalk/LatentSync 才是后续回答。

授权边界：Duix 适合先做本地 PoC 和第一期技术验收，但商业合同前必须复核社区版/商业版条款、月活或使用规模限制、模型权重授权和客户肖像/声音授权。Cutix 的代码层面不要把 Duix 写死为唯一 Provider，避免授权或质量问题导致整个平台返工。

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

MuseTalk + CosyVoice 不能丢。它不是为了替代 Duix 的交付包装，而是为了避免 Cutix 被单个本地平台绑定死。只要我们保留这条链路，Cutix 就拥有一个自研可控的基本数字人能力：文案转声音、声音驱动口型、输出片段、Remotion 合成。

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

LatentSync 的位置是 P1，不是 P0。原因是它更像一个高质量 lip-sync 引擎，而不是完整“本地数字人平台”。一旦 MuseTalk 的画质或口型不能过客户眼睛，再接 LatentSync 做同接口 A/B；如果 MuseTalk 够用，先不要把一期工期消耗在第二套重模型部署上。

## 6. 暂不进一期的项目

### LiveTalking / EchoMimicV2 / LivePortrait

LiveTalking 更接近实时交互数字人框架，可以参考它的本地服务化和实时流思路，但 Cutix 当前目标是批量离线生成商业 IP 短视频，不是直播互动。EchoMimicV2 和 LivePortrait 更适合补头动、表情、姿态或静态头像动画。

结论：这些项目可以做增强模块或二期研究，不作为当前批量视频工厂的主链路。

### HunyuanVideo-Avatar / OmniAvatar

这些项目更适合追求高质量生成式 avatar、身体动作、表情和镜头自然度。短期问题是：

- 推理成本更高。
- 生成速度和批量稳定性不确定。
- 授权、模型权重和客户商用边界要逐条复核。
- 输出往往是完整视频，不一定天然适合 Cutix 的分层合成。

结论：二期研究，不进入当前交付承诺。

### Wav2Lip / SadTalker

老牌项目适合实验、兜底和对比，但商业短视频里容易暴露分辨率、清晰度、稳定性或视觉自然度问题。

Wav2Lip 还存在明确的非商用边界，不应作为商业客户交付主线。SadTalker 更适合静态头像口播 demo，对现代商业短视频的自然度和清晰度支撑不足。

结论：不作为客户主方案，只保留为低优先级技术对照。

## 7. 近期落地动作

1. 准备一个客户授权的绿幕半身 avatar 样例。
2. 优先部署 Duix-Avatar 本地服务，跑通 `Cutix -> Duix -> Remotion -> MP4`。
3. 如果 Duix 原生接口不兼容 Cutix 契约，补一个 `duix-adapter` 服务。
4. 并行跑通 `CosyVoice -> MuseTalk service -> Cutix /api/digital-human -> Remotion -> MP4`，作为自研保底。
5. 连续生成 20 个数字人 scene，记录平均耗时、失败率、显存峰值、输出体积。
6. 如果 Duix/MuseTalk 质量不能验收，再接 LatentSync Provider 做 A/B 测试。

## 8. 选型复核来源

以下只作为技术选型入口，正式商用前仍要逐条复核许可证、模型权重和客户授权：

| 项目 | 官方入口 | 当前判断 |
|---|---|---|
| Duix-Avatar | https://github.com/duixcom/Duix-Avatar | P0，本地数字人平台优先验证 |
| MuseTalk | https://github.com/TMElyralab/MuseTalk | P0 保底，本地 lip-sync；本地 checkout 显示代码 LICENSE 为 MIT |
| CosyVoice | https://github.com/FunAudioLLM/CosyVoice | P0 保底，本地 TTS；本地 checkout 显示代码 LICENSE 为 Apache-2.0 |
| LatentSync | https://github.com/bytedance/LatentSync | P1，高质量 lip-sync 替换 provider |
| LiveTalking | https://github.com/lipku/LiveTalking | P2，实时交互/流式数字人参考 |
| EchoMimicV2 | https://github.com/antgroup/echomimic_v2 | P2，表情和半身动效增强 |
| LivePortrait | https://github.com/KlingTeam/LivePortrait | P2，肖像动画增强 |
| Wav2Lip | https://github.com/Rudrabha/Wav2Lip | P3，只做兜底/对比 |
| SadTalker | https://github.com/OpenTalker/SadTalker | P3，只做兜底/对比 |
