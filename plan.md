# Cutix — 商业短视频批量生成平台

## 0. 当前推进状态

更新时间：2026-05-31

当前仓库已经不再只是概念验证，`platform/` 内有一个可运行的 Next.js Web 控制台：

1. 已完成 Web 用户端第一版：IP/品牌选择、文案策略、素材库、模板、9:16 预览、任务状态。
2. 已完成本地素材上传入口：`/api/assets` 支持多文件上传，文件保存到 `platform/public/uploads/`。
3. 已完成素材元数据持久化：上传后的素材写入 `platform/data/assets.json`，前端刷新后会自动加载。
4. 已完成基础自动打标签：根据文件名、MIME 类型和关键词生成门店、人流、产品、招商、口播、BGM 等初始标签。
5. 已完成素材库 MVP 复核能力：视频缩略图、图片预览、标签编辑、启用/禁用。
6. 已完成 IP/品牌与模板配置 MVP：`/api/config` 支持本地读取、编辑、保存品牌和模板配置。
7. 已完成基础 Remotion 渲染 API：`/api/render` 会根据 IP 生成脚本并调用 Remotion 输出 MP4。

当前仍是 MVP 骨架，下一步应优先推进：

1. 把 `/api/assets` 的规则打标升级为视频抽帧 + 本地视觉模型打标。
2. 把 `/api/render` 从示例脚本升级为任务队列：创建任务、后台 Worker 渲染、前端轮询/订阅状态。
3. 接入数字人适配器：先定义统一接口，再接 MuseTalk/CosyVoice 或外部数字人返回物。
4. 把模板从硬编码 React 组件升级为可配置 Timeline JSON。
5. 增加 IP/品牌、标签体系、模板包的后台管理页面。

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

**同一个画面里，上面是数字人（露上半身）在讲，下面是素材/B-roll 在播放。** 不是 A 片段接 B 片段那种拼接，是合成在一个画框里。

```
  ┌────────────────────────────┐
  │                            │
  │    数字人上半身口播         │
  │    (透明通道叠加)           │
  │                            │
  ├────────────────────────────┤
  │                            │
  │    B-roll 素材 / 产品图    │
  │    数据卡片 / 场景视频     │
  │                            │
  ├────────────────────────────┤
  │    字幕 (逐字高亮)          │
  └────────────────────────────┘
  9:16 竖屏 (1080×1920)
```

数字人只露上半身，带透明通道。下面的区域放产品展示、门店场景、数据图表、客户案例等素材。字幕在底部，跟着语音逐字亮。背景是品牌色或渐变。这就是一条成品视频的样子。

### 一句话总结

一个 Web 后台，上传素材后，选 IP、选模板、点生成，系统自动把数字人口播 + B-roll 素材 + 字幕 + 品牌元素合成在一个画面里，输出完整视频。

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
- [ ] LLM 文案生成（结构化分镜脚本 + JSON Schema 校验）
- [ ] 自动选材（标签规则评分）
- [ ] CosyVoice 2 TTS 集成
- [ ] MuseTalk 数字人集成（单角色）
- [ ] FFmpeg 抠绿 + alpha 通道
- [ ] Remotion 模板合成（数字人 PIP + B-roll + 字幕叠加）
- [ ] FFmpeg 后处理（H.264/AAC + 封面 + 低清预览）
- [ ] 成品下载

### 第二期：批量生产

- [ ] 任务队列（BullMQ）+ 多 Worker 并发
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
- [ ] 统计报表（生成量/成功率/素材复用率）

---

## 11. 当前待办

- [ ] 确认 MuseTalk License 是否可用于商业项目
- [ ] 搭建 platform/ 主项目（Next.js + NestJS + Prisma + Docker）
- [ ] CosyVoice 2 本地部署 + 接口调试
- [ ] MuseTalk 本地部署 + 接口调试
- [ ] Remotion 写第一个合成模板（数字人 PIP + B-roll + 字幕）
- [ ] 确定本地 LLM 方案（vLLM / Ollama / 其他）
- [ ] 确定是否需要多租户/用户权限
