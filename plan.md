# Cutix — 商业短视频批量生成平台

## 0. 当前推进状态

更新时间：2026-06-02

当前仓库已经不再只是概念验证，`platform/` 内有一个可运行的 Next.js Web 控制台：

1. 已完成 Web 用户端第一版：IP/品牌选择、文案策略、素材库、模板、9:16 预览、任务状态。
2. 已完成本地素材上传入口：`/api/assets` 支持多文件上传，文件保存到 `platform/public/uploads/`。
3. 已完成素材元数据持久化：上传后的素材写入 `platform/data/assets.json`，前端刷新后会自动加载。
4. 已完成基础自动打标签：根据文件名、MIME 类型和关键词生成门店、人流、产品、招商、口播、BGM 等初始标签。
5. 已完成素材库 MVP 复核能力：视频缩略图、图片预览、标签编辑、启用/禁用。
6. 已完成 IP/品牌与模板配置 MVP：`/api/config` 支持本地读取、编辑、保存品牌和模板配置。
7. 已完成大模型接口配置 MVP：`/api/llm-config` 支持用户填写本地/兼容大模型 API、模型名和 API Key。
8. 已完成基础 Remotion 渲染 API：`/api/render` 会根据 IP 生成脚本并调用 Remotion 输出 MP4。
9. 已完成结构化分镜脚本生成 MVP：`/api/script` 支持本地规则兜底和 OpenAI-compatible 大模型接口，前端可预览 scene、布局、数字人需求和素材标签。
10. 已完成自动选材 MVP：`/api/selection` 会按分镜标签、布局、数字人槽位、B-roll 槽位和 BGM 对素材库打分，前端可预览匹配结果并同步选中素材。
11. 已完成 TTS 适配 MVP：`/api/tts` 支持本地 CosyVoice FastAPI 适配（`COSYVOICE_FASTAPI_URL`）和 Windows SAPI 兜底，输出 WAV、音频 URL 和字幕时间轴。
12. 已完成数字人片段生成 MVP：`/api/digital-human` 支持 MuseTalk CLI 适配器和本地 FFmpeg 占位片段兜底，前端可按 TTS 分镜生成并预览数字人片段。
13. 已完成 FFmpeg 抠绿 + alpha 通道 MVP：数字人源片保留为 MP4，同时用 chromakey 转出 VP9 WebM 透明通道片段，供后续 Remotion 同屏合成使用。
14. 已完成 Remotion 模板合成 MVP：`/api/render` 会把脚本、选材、TTS 音频和数字人 alpha 组装为 Timeline，并渲染数字人 + B-roll + 字幕的 9:16 成片。
15. 已完成 FFmpeg 后处理 MVP：成片会标准化为 H.264/AAC MP4，同时生成封面 JPG 和低清预览 MP4，前端可预览并下载正式成片。
16. 已完成数字人生产接入配置 MVP：`/api/digital-human-config` 支持 HTTP 数字人 API、MuseTalk CLI 和占位测试三种模式，API Key 本地保存但前端只返回脱敏状态。
17. 已完成控制台技术项收纳 MVP：大模型接口和数字人接入已经移入「系统设置」，主界面保留用户生产流程和状态。
18. 已完成分镜编排预览 MVP：右侧预览不再固定为“上人下素材”，会按脚本里的 scene layout 展示全屏数字人、全屏素材、上人下素材、上素材下人等分段结构。
19. 已完成 `videoPlan` 编排契约 MVP：`/api/script` 在兼容旧 `scenes` 的同时输出 `videoPlan`，包含全局节奏、BGM 情绪、每段画面目标、数字人位置、素材槽位、字幕策略和转场；`/api/selection` 和 `/api/render` 已开始消费该编排计划。
20. 已完成 `videoPlan` 版本化与本地持久化 MVP：每次生成会带 `id`、`schemaVersion = cutix.video_plan.v1`、`createdAt`，并写入 `platform/data/video-plans/`，用于后续失败重试、替换素材后复用同一编排。
21. 已完成生成任务台账 MVP：`/api/render` 会创建 render task，持续写入 `platform/data/render-tasks/`，记录 `videoPlan.id`、阶段、结果 URL 和失败原因；前端任务状态卡可查看最近任务。
22. 已完成进程内后台任务提交 MVP：`POST /api/render-tasks` 会先创建任务并立即返回 `taskId`，再在服务端后台消费现有 `/api/render` 渲染流；前端提交任务后轮询台账，完成后自动显示预览和下载。
23. 已完成批量任务提交 MVP：生成数量 `count` 不再只是前端展示，`POST /api/render-tasks` 会按数量创建多条 render task，并在当前进程内按队列顺序执行，避免本机 Remotion/FFmpeg 并发过载。
24. 已完成任务 payload 持久化与重试 MVP：新建任务会把完整渲染请求写入 `platform/data/render-task-payloads/`，失败/完成任务可通过 retry API 重新提交，前端任务卡显示“重试/重渲染”入口。
25. 已完成独立 Render Worker CLI MVP：`npm run worker:render` 会轮询 queued 任务、读取持久化 payload 并调用统一 runner 执行；`CUTIX_RENDER_AUTOSTART=false` 可让 API 只创建任务，由 Worker 接管执行。
26. 已完成 Worker 监控 MVP：Render Worker 会写入本地心跳状态，`GET /api/worker-status` 返回 Worker 健康状态和队列统计，前端顶部 Worker/队列数字已改为真实数据。

当前仍是 MVP 骨架，下一步应优先推进：

1. 把进程内后台任务升级为真正独立 Worker 队列：Render Worker 从 Next.js API Route 中拆出，接入 Redis/BullMQ，多 Worker 并发渲染，支持失败重试、取消、超时和 Worker 监控。
2. 把 `videoPlan` 从 MVP 校验升级为严格 JSON Schema：支持版本迁移、模型输出修复和人工锁定。
3. 把 `/api/assets` 的规则打标升级为视频抽帧 + 本地视觉模型打标。
4. 增加 IP/品牌、标签体系、模板包的后台管理页面。

## 1. 产品形态

### 用户看到的

一个简单的 Web 页面：

1. 选择要生成哪个 IP（品牌/数字人）
2. 选择哪个类目/模板（招商、产品介绍、口播……）
3. 输入产品信息（可选，也可以直接用模板默认文案）
4. 点 **"生成"**
5. 看到预计剩余时间
6. 完成后下载视频

素材库在后台静默运行——用户只需要上传过素材，系统自动打标签、自动匹配，不需要用户操心。

### 最终视频长什么样

最终视频不是固定“数字人在上、素材在下”的单一版式，而是一条由大模型编排出来的分镜 Timeline。每个分镜可以使用不同布局：

```
  ┌────────────────────────────┐
  │  scene 1：全屏数字人 Hook   │
  ├────────────────────────────┤
  │  scene 2：上人下素材讲痛点  │
  ├────────────────────────────┤
  │  scene 3：上素材下人讲方案  │
  ├────────────────────────────┤
  │  scene 4：全屏素材展示案例  │
  ├────────────────────────────┤
  │  scene 5：全屏数字人 CTA    │
  └────────────────────────────┘
  9:16 竖屏 (1080×1920)
```

数字人片段来自数字人服务回传或 MuseTalk 本地生成，可以带透明通道；素材区来自本地素材库的自动标签匹配。字幕、BGM、品牌色、转场和各段布局都由隐藏工作流统一交给 Remotion 合成。

### 一句话总结

一个 Web 后台，上传素材后，选 IP、选模板、点生成，系统自动生成文案和分镜编排，再把数字人口播 + 本地 B-roll 素材 + 字幕 + 品牌元素合成为完整视频。

---

## 2. 已拉取的项目

```
C:\Users\xiaoy\Desktop\cutix\
├── remotion/       ← remotion-dev/remotion      模板渲染引擎（React 组件 → MP4）
├── smartcut/       ← skeskinen/smartcut          长视频无损裁切（素材预处理）
├── musetalk/       ← TMElyralab/MuseTalk          数字人唇形驱动（音频 → 口播视频）
├── cosyvoice/      ← FunAudioLLM/CosyVoice        TTS 语音合成 + 声音克隆
└── plan.md                                       本文件
```

各项目角色：

| 项目 | 在这个系统里的作用 | 部署要求 |
|---|---|---|
| Remotion | 最终视频合成引擎。根据 Timeline JSON 把数字人片段、B-roll 素材、字幕、品牌水印叠在一起渲染成 MP4 | Node.js 服务器，Chrome |
| MuseTalk | 数字人"口型驱动"。输入音频 + 角色参考图/视频 → 输出口播视频（绿幕背景） | NVIDIA GPU，12GB+ VRAM |
| CosyVoice 2 | TTS 语音合成。输入文案 → 输出 WAV 音频 + 音素时间戳（用于唇形同步和字幕对齐） | NVIDIA GPU，8GB+ VRAM |
| smartcut | 素材预处理。把长视频无损裁切成短片段（二期才引入，一期不依赖） | Python，FFmpeg |
| FFmpeg | 贯穿全流程。抠绿、编码标准化、响度归一化、多尺寸导出、封面生成 | 系统级依赖 |

---

## 3. 用户操作流程

### 3.1 用户侧

```
打开 Web 页面
  → 选择要生成的商业 IP（比如"老王餐饮"）
  → 点击「生成」
  → 看到进度条 + 预计剩余时间
  → 下载成品视频
```

就两步：选 IP、点生成。模板、布局、文案、选材全部由大模型根据场景自动决定。

每个 IP 背后已经预先配置好了：数字人角色、声音、品牌色、logo、字体、BGM、口吻风格。用户不需要每次去选。

### 3.2 系统侧（大模型自动决策）

```
用户点「生成」后：

  LLM 根据 IP 的行业/产品/风格，自动决定：
    → 这次生成什么类型的视频（招商？产品？案例？口播？）
    → 每个段落用什么布局（上人下素材？全屏数字人？全屏素材？）
    → 每段的文案和情绪
    → 每段需要什么标签的 B-roll 素材

  然后自动执行：
    → 选材（标签规则评分匹配素材库）
    → 数字人渲染（TTS + MuseTalk + 抠绿）
    → Remotion 合成（按 LLM 决定的布局组装画面）
    → FFmpeg 后处理
    → 成品入库 → 通知前端
```

---

## 4. 数字人方案：MuseTalk + CosyVoice 2

### 4.1 为什么选这个组合

| 维度 | MuseTalk | CosyVoice 2 |
|---|---|---|
| 来源 | 腾讯音乐娱乐 | 阿里通义实验室 |
| 开源协议 | 待确认 | Apache 2.0 |
| 中文支持 | 良好 | 开源第一梯队 |
| 核心能力 | 音频驱动唇形同步 | 零样本声音克隆（3-10s 样本） |
| 部署 | GPU 12GB+ | GPU 8GB+ |
| 速度 | RTX 4090 ≈ 0.3s/frame | 实时 |

### 4.2 数字人生产流水线

```
口播文案（来自 LLM 脚本的一段 segment.text）
  │
  ├─→ CosyVoice 2
  │   输入：text + voice_profile（声音克隆样本）
  │   输出：audio.wav + phoneme_timestamps.json
  │
  ├─→ MuseTalk
  │   输入：audio.wav + character_reference（角色参考图/视频）
  │   输出：talking_head_green.mp4（绿色背景）
  │
  ├─→ FFmpeg chroma key（或 RMBG-2.0）
  │   输入：talking_head_green.mp4
  │   输出：talking_head_alpha.webm（透明通道）
  │
  └─→ 入库 assets 表
      type = digital_human_clip
      tags = [IP_XX, 数字人, 口播, 对应 slot 的用途标签]
```

### 4.3 分段渲染，不渲染一整段

一个 30 秒视频的脚本有 3-5 个分镜段落（scene），每个需要数字人的 scene 单独渲染：

- 单段失败 → 只重试这一段，不重来整条
- 同一 IP 的自我介绍/结尾 CTA 可跨视频缓存复用
- 不同 scene 可并行投递到多个 GPU worker
- 可切换画面节奏：开场全屏数字人 → 中间画中画数字人 + B-roll → 结尾全屏 CTA

---

## 5. 视频画面结构

画面布局不是固定的，由模板定义。每个段落（slot）可以选择不同的布局模式。

### 5.1 四种基础布局

| 布局模式 | 画面构成 | 适用场景 |
|---|---|---|
| `上人下素材` | 上半部分数字人 + 下半部分 B-roll | 标准讲解模式 |
| `上素材下人` | 上半部分 B-roll + 下半部分数字人 | 素材为主、数字人为辅 |
| `全屏数字人` | 数字人满屏，纯色/渐变背景 | 开场 hook、结尾 CTA |
| `全屏素材` | B-roll 满屏，数字人只出声音（或无声） | 案例展示、产品特写、氛围铺垫 |

### 5.2 Remotion 合成层级（z-index）

不管哪种布局，都是这几层，只是位置和大小不同：

```
z: 4   字幕层        逐字高亮，基于 CosyVoice 2 音素时间戳驱动
z: 3   数字人层      上半身 alpha 通道 WebM
z: 2   素材层        B-roll 视频/图片/数据卡片
z: 1   背景层        品牌色/渐变
z: 0   底图层        纯色底
```

### 5.3 一条视频的画面节奏

一个 30s 视频在不同段落切换不同布局，模板里可以自由组合：

| 段落 | 布局 | 说明 |
|---|---|---|
| 开头 hook | 全屏数字人 | 抓注意力 |
| 痛点 | 上人下素材 | 说痛点时有画面佐证 |
| 方案 | 上素材下人 | 产品/方案展示为主，数字人旁白 |
| 案例 | 全屏素材 | 数据图表、客户现场，数字人只出声音 |
| 结尾 | 全屏数字人 | 号召行动 + 二维码 |

每个模板可以自己定义哪些 slot 用哪种布局。用户生成时不需要选布局——模板已经预设好了。

---

## 6. 分镜脚本结构（LLM 输出）

LLM 根据模板、产品信息和品牌口吻，生成结构化分镜脚本。每个 scene 的 `layout` 由模板预设，LLM 负责填文案和 emotion。

```json
{
  "title": "为什么聪明的餐饮人都在做标准化？",
  "scenes": [
    {
      "slotId": "opening",
      "layout": "全屏数字人",
      "text": "普通餐饮门店如何在一个月内提升三倍转化？我是老王，做了十二年餐饮。",
      "emotion": "energetic"
    },
    {
      "slotId": "pain",
      "layout": "上人下素材",
      "text": "很多餐饮老板跟我反馈，客流不少，但复购率就是上不去。",
      "emotion": "concerned",
      "requiredBroll": ["门店", "客流", "经营"]
    },
    {
      "slotId": "solution",
      "layout": "上素材下人",
      "text": "我们花了三年打磨出一套标准化门店运营体系。",
      "emotion": "confident",
      "requiredBroll": ["产品展示", "流程图"]
    },
    {
      "slotId": "proof",
      "layout": "全屏素材",
      "durationEstimate": 5,
      "requiredBroll": ["客户现场", "数据图表"],
      "overlayTexts": [
        {"text": "已服务 200+ 餐饮门店", "style": "data_card"}
      ]
    },
    {
      "slotId": "cta",
      "layout": "全屏数字人",
      "text": "现在私信"增长方案"，免费领取完整资料包！",
      "emotion": "urgent"
    }
  ]
}
```

---

## 7. Web 页面结构

### 面向普通用户

| 页面 | 做什么 |
|---|---|
| **首页** | 展示所有已配置好的商业 IP 卡片（头像 + 名称），**点一个 IP → 点生成 → 等着下载** |
| 成品列表 | 历史生成的所有视频，预览、下载 |
| 素材上传 | 拖拽上传，自动打标签 |

模板、布局、文案——这些大模型自动决策，不暴露给用户。

### 面向管理/配置（一次性设置，不频繁打开）

| 页面 | 做什么 |
|---|---|
| IP/品牌配置 | 给每个 IP 配：数字人角色、声音、品牌色、logo、字体、BGM、行业/产品描述、口吻风格（这些信息会被 LLM 用来决策模板和文案） |
| 数字人管理 | 注册形象、上传声音样本、测试效果 |
| 标签管理 | 维护标签，给素材打标签 |
| 模板库 | 可选：为特殊场景创建新模板（LLM 自动从模板库里选最合适的） |
| Worker 监控 | 队列、GPU、日志 |

---

## 8. 核心数据模型

```
assets          — 素材（视频/图片/音频/logo/数字人片段）
tags            — 标签（场景/镜头/情绪/用途/平台/IP）
asset_tags      — 素材-标签多对多
brands          — IP/品牌（色板/logo/字体/BGM/数字人角色/声音/口吻）
templates       — 视频模板（slot 定义/画面策略/字幕样式）
copy_variants   — LLM 生成的分镜脚本（scenes JSON）
timeline_drafts — 组装的 Timeline JSON（待渲染）
render_jobs     — 渲染任务（状态/进度/错误）
digital_human_jobs — 数字人渲染子任务
worker_events   — Worker 日志
```

---

## 9. 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js + React + TypeScript + Tailwind + shadcn/ui + Remotion Player |
| 后端 API | NestJS（或 Next.js API Route，MVP 阶段可简化） |
| 数据库 | PostgreSQL + Prisma |
| 队列 | Redis + BullMQ |
| 对象存储 | MinIO（S3 兼容） |
| 模板渲染 | Remotion renderMedia |
| 媒体处理 | FFmpeg |
| TTS | CosyVoice 2（Edge TTS 作为 MVP 免 GPU 备选） |
| 数字人 | MuseTalk（Wav2Lip 作为备选） |
| LLM | 本地模型（vLLM/Ollama）或 API provider 抽象层 |

---

## 10. 分期计划

### 第一期：闭环验证（跑通一条视频）

- [ ] 平台工程搭建（Next.js/NestJS + PostgreSQL + Redis + MinIO + Docker）
- [x] 素材上传 + 缩略图自动生成 + 人工标签（MVP：本地文件 + 本地 JSON）
- [x] IP/品牌配置 + 模板管理（3 个模板，MVP：本地 JSON 配置）
- [x] LLM 文案生成（结构化分镜脚本 + JSON Schema 校验，MVP：本地规则兜底 + 可选大模型接口）
- [x] `videoPlan` 编排契约（MVP：文案、分镜、布局、素材需求、数字人口播、字幕、转场统一输出）
- [x] `videoPlan` 版本化与本地持久化（MVP：schemaVersion + plan id + data/video-plans）
- [x] 控制台技术设置收纳（MVP：大模型接口、数字人接入隐藏到系统设置）
- [x] 自动选材（标签规则评分，MVP：scene 槽位拆分 + 素材打分 + 前端预览）
- [x] CosyVoice 2 TTS 集成（MVP：本地 FastAPI 适配 + Windows SAPI 兜底 + WAV/字幕时间轴）
- [x] MuseTalk 数字人集成（单角色，MVP：统一 `/api/digital-human` 接口 + MuseTalk CLI 适配器 + FFmpeg 占位兜底）
- [x] HTTP 数字人 API 接入配置（MVP：本地保存 endpoint/API Key，调用统一 `/api/digital-human` 适配）
- [x] FFmpeg 抠绿 + alpha 通道（MVP：chromakey + VP9 WebM 透明通道 + 源片 MP4 保留）
- [x] Remotion 模板合成（MVP：数字人 alpha + B-roll + TTS 音频 + 字幕 Timeline）
- [x] FFmpeg 后处理（MVP：H.264/AAC + 封面 + 低清预览 + loudnorm）
- [x] 成品下载（MVP：结果预览 + 正式 MP4 下载）
- [x] 生成任务台账（MVP：本地 JSON 持久化任务状态和结果 URL）

### 第二期：批量生产

- [ ] 任务队列（BullMQ）+ 多 Worker 并发
- [ ] Render Worker 从同步 SSE 拆出，按 `videoPlan.id` 异步执行
- [ ] 数字人分段并行渲染 + 缓存复用
- [ ] 失败重试 + 完整错误日志
- [ ] 批量生成任务（一次提交 N 条）
- [ ] 多尺寸输出（9:16 / 16:9 / 1:1）
- [ ] 音频响度归一化

### 第三期：智能化

- [ ] Whisper ASR 素材自动转写
- [ ] Scene detection 自动镜头切分 + smartcut 裁切
- [ ] CLIP 视觉标签自动建议
- [ ] LLM 脚本 A/B 变体
- [x] LLM 输出统一 `videoPlan` MVP（文案、分镜、布局、素材需求、数字人口播、字幕、转场）
- [x] `videoPlan` JSON Schema 版本标识 + 本地保存
- [ ] `videoPlan` 严格 Schema 校验 + 版本迁移 + 任务失败复用
- [ ] 统计报表（生成量/成功率/素材复用率）

---

## 11. 当前待办

- [ ] 确认 MuseTalk License 是否可用于商业项目
- [ ] 搭建 platform/ 主项目（Next.js + NestJS + Prisma + Docker）
- [ ] CosyVoice 2 本地部署 + 接口调试
- [ ] MuseTalk 本地部署 + 接口调试
- [ ] Remotion 写第一个合成模板（数字人 PIP + B-roll + 字幕）
- [x] 确定本地 LLM 方案配置入口（vLLM / Ollama / OpenAI Compatible，MVP：用户自行填写 API）
- [x] 确定数字人生产接入入口（HTTP API / MuseTalk CLI / 占位测试三模式）
- [ ] 确定是否需要多租户/用户权限

## 12. 2026-06-02 推进记录

### 已完成：进程内后台生成任务 MVP

- 新增 `POST /api/render-tasks`：前端提交成片生成后，接口先创建 render task 台账并立即返回 `202 + taskId`，用户不再需要等待 `/api/render` 的 SSE 长连接结束。
- `/api/render` 支持传入已有 `taskId`：后台任务入口可以复用同一个任务记录，避免重复创建台账。
- 后台入口会在服务端消费 `/api/render` 的 SSE 流：Remotion 渲染、FFmpeg 后处理和失败原因仍然写入 `platform/data/render-tasks/`。
- 前端生成按钮改为提交后台任务并轮询 `GET /api/render-tasks`：任务完成后自动同步 `resultUrl`、`previewUrl`、`coverUrl` 并显示预览/下载。
- 当前任务卡补充展示后台阶段和完成/失败状态。
- `count` 已接入任务创建：一次点击可以创建多条后台任务，当前 MVP 按队列顺序执行；前端会同步返回的任务列表，并把当前任务指向整批队列的最后一条，用于持续显示整批生成状态。
- 新增任务 payload 持久化与 retry API：新任务保存完整请求 payload，`POST /api/render-tasks/[taskId]/retry` 可读回 payload 并重置任务状态，前端对可恢复任务显示“重试/重渲染”按钮。
- 新增独立 Render Worker CLI：`npm run worker:render` 持续轮询 queued 任务，`npm run worker:render:once` 可跑一次空队列/单任务检查；设置 `CUTIX_RENDER_AUTOSTART=false` 后，API 不再自动执行任务，方便切到 Worker 模式。
- 新增 Worker 心跳与状态 API：`platform/data/worker-state/` 记录 Worker 在线、空闲/处理中、当前任务和处理数量；`GET /api/worker-status` 汇总 Worker 健康状态和 queued/running/failed 队列数，前端顶部不再硬编码 Worker 数。

### 下一步

- 这一步仍是本地 Node 进程内后台任务，不是最终生产队列。下一步应把任务执行从 Next.js API Route 中拆出为独立 Render Worker，并接入 Redis/BullMQ，实现多 Worker 并发、失败重试、任务取消和 Worker 监控。
