# Cutix — 商业短视频批量生成平台

## 0. 当前推进状态

更新时间：2026-06-06

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
27. 已完成排队任务取消 MVP：新增 `POST /api/render-tasks/[taskId]/cancel`，只允许取消仍处于 `queued` 的任务；前端最近任务卡可直接取消排队任务，Worker 和进程内队列会跳过已取消任务。
28. 已完成 `videoPlan` 严格校验/修复 MVP：抽出 `src/lib/video-plan-schema.ts`，脚本生成、自动选材和最终渲染都通过同一套 schema 校验；缺失或损坏的 plan 会自动修复为安全结构。
29. 已完成数字人占位隔离 MVP：`/api/digital-human` 不再静默把生产失败 fallback 成占位；占位片段只能显式测试，前端禁止把测试占位数字人提交到最终成片任务。
30. 已完成数字人 HTTP API 契约 MVP：HTTP provider 支持同步 `videoUrl/alphaVideoUrl` 返回，也支持 `statusUrl/pollUrl` 异步 job 轮询；`docs/digital-human-http-api.md` 已写清对接协议。
31. 已完成 IP 级数字人角色档案 MVP：品牌配置可维护数字人角色名称、声音标识、参考素材路径和备注；生成数字人时会把当前 IP 的角色信息传给 HTTP API/MuseTalk。
32. 已完成 HeyGen 云端参考接入 MVP：系统可调用 HeyGen WebM API 生成效果参考片段，但它不解锁正式生产；老板要求本地化部署后，云 API 只作为临时效果评估，不进入交付主链路。
33. 已完成一键式生产入口 MVP：主流程按钮会自动串联文案/分镜、选材、TTS、数字人、成片任务提交，并支持 `count` 批量创建渲染任务。
34. 已明确本地数字人主路线：老板要求本地化部署后，第一期以 Duix-Avatar/HeyGem 本地服务作为验收优先 Provider，MuseTalk + CosyVoice 2/3 作为自研保底链路，LatentSync 作为高质量口型备选；HunyuanVideo-Avatar、OmniAvatar、EchoMimicV2/V3 暂列研究项，不进入近期交付承诺，不再把云数字人平台作为正式交付依赖。
35. 已新增 MuseTalk 本地 HTTP 服务脚本：`npm run digital-human:musetalk-service` 会启动 `http://127.0.0.1:8788/generate`，接收 Cutix 的数字人 HTTP 请求并调用本机 MuseTalk 输出口播片段。
36. 已增强本地数字人健康检查：MuseTalk HTTP 服务 `/health` 会检查 Python、FFmpeg、MuseTalk 根目录、UNet 权重、配置文件、输出目录和服务任务目录；Cutix 的数字人接入检查会优先读取 `/health` 并把依赖状态展开到控制台，避免把错误 endpoint 或缺权重环境误判为可生产。
37. 已补齐数字人素材绑定入口：素材上传会识别文件名中的 `avatar`、`musetalk`、`talking`、`数字人`、`口播`、`绿幕` 等关键词，将本地上传的数字人参考素材归为 `avatar` 类型并保存本地绝对路径；品牌配置页可从素材库 avatar 候选一键绑定到当前 IP 的数字人角色。
38. 已增强数字人角色素材预检：数字人接入检查会校验本机绝对 `avatarPath` 是否可读取；远程 URL 或非绝对路径会提示由服务自行解析，MuseTalk CLI 模式下缺失或不可读的角色素材会阻止生产。
39. 已把数字人生产预检接入一键生产入口：点击一键生产后会先调用 `/api/digital-human-config/test` 检查本地数字人服务、avatar 路径和交付策略；预检失败时会打开系统设置并阻止后续文案、TTS、数字人和成片任务，避免长链路跑到中途才失败。
40. 已新增主界面生产就绪摘要：一键生产区域会汇总数字人、素材库、Worker 和批量数量状态，显示阻断项和提醒项，让用户提交前就能看到当前能否批量生产。
41. 已把本地存储占用接入 Worker 监控：`/api/worker-status` 会统计 `public/output`、`public/uploads` 和 `data` 目录大小，主界面生产就绪摘要会显示当前存储占用，批量渲染前可提前发现输出目录膨胀问题。
42. 已在任务状态卡展示存储分布：Worker/任务状态区域会按输出、上传、任务数据三个目录显示本地占用，便于批量生产时定位空间增长来源。
43. 已新增安全存储清理 MVP：`/api/storage-cleanup` 只扫描/清理 7 天以上的预览、封面和 MuseTalk 工作目录，前端任务状态卡可先 dry-run 扫描，再手动清理临时文件，不删除正式成片 MP4。
44. 已新增 Duix 本地接入预设和 adapter：系统设置的数字人接入区可一键套用 `http://127.0.0.1:8789/generate`，Cutix 的 `npm run digital-human:duix-adapter` 会把统一契约转换成 Duix 原生 `/easy/submit`/`/easy/query`；同时保留 MuseTalk 服务预设。
45. 已增强 HTTP 数字人 alpha 兜底：本地 HTTP Provider 返回普通 `/output/...mp4` 且未自带 `alphaVideoUrl` 时，`/api/digital-human` 会自动用 FFmpeg chromakey 转出 VP9 alpha WebM，方便 Duix/MuseTalk wrapper 输出进入 Remotion 分层合成。
46. 已增强 Duix adapter 生产预检：Duix 原生 `/easy/query` 不可达时，adapter `/health` 默认返回 fail 并阻断 Cutix 一键生产；只有显式设置 `DUIX_HEALTH_ALLOW_UNREACHABLE=1` 才允许调试阶段降级为 warn。
47. 已新增本地视觉打标配置入口：`/api/vision-config` 支持在系统设置保存本地视觉模型 endpoint/API Key，`/api/assets/analyze` 会读取该配置并把关键帧路径发给本地视觉服务；`docs/vision-analyzer-http-api.md` 已记录对接契约。
48. 已复核老板要求的本地化数字人约束：正式交付链路只接受客户内网/本机部署的数字人服务；`docs/local-digital-human-selection.md` 已明确 Duix-Avatar/HeyGem 为一期验收优先，MuseTalk + CosyVoice 为自研保底，LatentSync 为质量替换，云 API 只允许做效果参考。
49. 已新增本地数字人连续生成压测脚本：`npm run digital-human:benchmark` 会按 Cutix 数字人 HTTP 契约连续提交多个 scene，记录 Provider 健康检查、成功率、平均耗时、P95、输出文件大小和逐 scene 错误，报告写入 `platform/data/digital-human/benchmarks/`；详见 `docs/digital-human-benchmark.md`。
50. 已把本地数字人 benchmark 报告接入 Web 后台：`/api/digital-human-benchmark` 会读取最近报告，首页任务状态卡展示最近一次成功率、平均耗时、P95、输出体积和健康状态，让客户/运营人员不用进终端也能看到本地数字人稳定性证据。
51. 已新增 Web 端启动数字人 benchmark：当页面已有 TTS 音频且数字人 HTTP endpoint 已保存时，任务状态卡可用首段 TTS 启动后台 benchmark 子进程；Web 模式只接受 Cutix `/output` 或 `/uploads` 音频，避免任意读取本机文件。
52. 已把本地数字人 benchmark 纳入一键生产前的生产就绪摘要：没有报告会提示“未跑本地压测”，有报告会显示通过数和平均耗时，作为生产风险提示但不阻断开发阶段的一键生成。
53. 已把默认本地数字人服务健康状态纳入一键生产前的阻断摘要：当数字人 HTTP endpoint 命中 Duix Adapter 或 MuseTalk Service 默认本地地址但服务离线时，生产就绪摘要会直接显示阻断项，避免用户在配置已保存但服务未启动时提交长链路任务。
54. 已新增 Duix Adapter 字段解析自测：`npm run digital-human:duix-selftest` 会覆盖 top-level、嵌套 `data/result`、数组结果、远程 URL、本地/容器路径、完成但无视频字段、失败状态和进度字段，防止后续改动把 Duix 返回结果识别逻辑改坏。
55. 已新增本地视觉打标参考服务：`npm run vision:analyzer-service` 会启动 `http://127.0.0.1:8890/analyze`，接入本地 OpenAI-compatible 视觉模型；`npm run vision:analyzer-selftest` 覆盖 JSON 解析、标签归一化、元数据 fallback 和关键帧路径白名单。
56. 已把本地视觉打标服务接入 Web 启动与状态面板：系统设置里可启动 Vision Analyzer wrapper，自动填入默认 endpoint，并显示 `/health` 在线状态、最近一次 Web 启动 PID 与 stdout/stderr 日志尾部。
57. 已接通上传后自动视觉打标：素材上传成功后，如果已保存本地视觉 endpoint，前端会自动把本次新上传且已抽帧的素材逐个提交到 `/api/assets/analyze`，把视觉模型返回的标签和摘要写回素材库。
58. 已把视觉 analyzer 纳入一键生产前的生产就绪摘要：未配置视觉 endpoint 会提示仍是基础标签，默认本地 analyzer 离线会显示提醒，在线或内网视觉服务已配置时显示通过。
59. 已把本地数字人选型路线固化到系统设置和选型文档：后台明确显示 Duix-Avatar/HeyGem 为 P0 本地平台主线、MuseTalk + CosyVoice 为 P0 自研保底、LatentSync 为 P1 质量替换位，云 API 和 Wav2Lip 不进入客户正式生产主链路。
60. 已补齐 Worker/任务状态的渲染耗时监控：任务状态卡会显示最近完成任务平均总耗时、P95、失败任务数，最近任务列表会显示等待/历时/总耗时和失败错误摘要，便于批量生产时评估吞吐和定位失败。
61. 已把 render task 阶段耗时写入任务台账：任务状态变更时会记录 `startedAt`、`stageStartedAt`、`stageDurations` 和 `stageHistory`，前端最近任务会显示各阶段耗时 chip；重试会重置本轮计时，并新增 `npm run render-task-store:selftest` 覆盖阶段切换与重试重置。
62. 已把本地 Render Worker 升级为带 lease 的可靠队列 MVP：Worker 领取任务会写入 `attempt/maxAttempts/lockedBy/lockedAt/nextRunAt/lastError`，失败会按指数退避自动回队列，超时运行任务会被恢复或打失败；前端任务状态显示自动重试、锁定 Worker、疑似超时、尝试次数和上次错误。

当前仍是 MVP 骨架，下一步应优先推进：

1. 部署并验证 Duix-Avatar/HeyGem 本地服务，跑通 `Cutix -> Duix 本地数字人 -> Remotion` 的真实本地数字人成片；验证时先用 `digital-human:benchmark --count 20` 记录稳定性，再提交一键成片。
2. 并行上传并绑定真实绿幕 avatar 素材，在本机或客户 GPU 服务器跑通 `CosyVoice -> musetalk-service -> /api/digital-human -> Remotion` 的自研保底链路，并同样跑 20 scene benchmark。
3. 完成本地数字人部署包：整理 Duix、MuseTalk、CosyVoice、FFmpeg、NVIDIA 驱动/CUDA、模型权重路径、健康检查和失败重试脚本，让客户服务器可复现部署。
4. 把进程内后台任务升级为真正独立 Worker 队列：Render Worker 从 Next.js API Route 中拆出，接入 Redis/BullMQ，多 Worker 并发渲染，支持失败重试、取消、超时和 Worker 监控。
5. 部署并验证真实本地视觉模型链路：用 `vision:analyzer-service` 接 Ollama/vLLM/Qwen-VL/InternVL，批量分析现有素材关键帧，确认标签质量、耗时和失败恢复策略。
6. 增加 IP/品牌、标签体系、模板包的后台管理页面。

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

## 2. 外部项目目录与接入规划

```
C:\Users\xiaoy\Desktop\cutix\
├── remotion/       ← remotion-dev/remotion      模板渲染引擎（React 组件 → MP4）
├── smartcut/       ← skeskinen/smartcut          长视频无损裁切（素材预处理）
├── duix-avatar/    ← duixcom/Duix-Avatar          本地数字人平台（下一步拉取/部署验证）
├── musetalk/       ← TMElyralab/MuseTalk          数字人唇形驱动（自研保底 Provider）
├── cosyvoice/      ← FunAudioLLM/CosyVoice        TTS 语音合成 + 声音克隆
└── plan.md                                       本文件
```

各项目角色：

| 项目 | 在这个系统里的作用 | 部署要求 |
|---|---|---|
| Remotion | 最终视频合成引擎。根据 Timeline JSON 把数字人片段、B-roll 素材、字幕、品牌水印叠在一起渲染成 MP4 | Node.js 服务器，Chrome |
| Duix-Avatar / HeyGem | 本地数字人服务层。输入口播文本/音频和角色配置 → 输出数字人口播视频，作为第一期验收优先 Provider | NVIDIA GPU，本地 Docker/服务部署，授权需复核 |
| MuseTalk | 数字人"口型驱动"保底。输入音频 + 角色参考图/视频 → 输出口播视频（绿幕背景） | NVIDIA GPU，12GB+ VRAM |
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

## 4. 数字人方案：本地化部署优先

### 4.0 当前选型结论

老板要求数字人本地化部署后，正式交付链路只接受本地数字人服务。云平台不再作为生产依赖，Cutix 只通过统一 `/api/digital-human` Provider 契约对接本地数字人服务：

详细选型、验证门槛和二期候选项目记录在 `docs/local-digital-human-selection.md`。

| 优先级 | 项目 | 当前定位 | 选择理由 | 风险/边界 |
|---|---|---|---|---|
| 验收优先 | Duix-Avatar / HeyGem | 平台型本地数字人服务 | 更接近“本地数字人平台”，适合老板要求的本地化部署；系统设置已提供本地 HTTP 预设，Cutix 仍负责文案、素材、编排和 Remotion 合成 | 体量更重，授权和商业边界必须复核；如果原生 API 与 Cutix 契约不一致，需要 `duix-adapter` 转换协议 |
| 自研保底 | MuseTalk + CosyVoice 2/3 | 本地 TTS + 本地口型驱动，保证 Cutix 不被单一平台绑定 | 已经适配进 Cutix；形态简单，输入音频 + 角色参考视频，输出口播片段；适合分段生成、失败重试、Remotion 合成 | 主要是口型/半身表达，不是完整“真人拍摄级”生成；绿幕/alpha 效果依赖角色素材质量 |
| 质量备选 | LatentSync | 高清口型同步 Provider | 适合替换或补强 MuseTalk 的唇形质量；保留在同一个 HTTP Provider 契约后面 | 推理成本、批量速度和 Windows/服务器部署复杂度要实测，暂不承诺一期主链路 |
| 二期研究 | HunyuanVideo-Avatar / OmniAvatar | 生成式高质量数字人视频 | 画面表现更强，适合后续做全身、半身、情绪、肢体增强 | 通常更吃 GPU、吞吐不可控、商业授权更复杂；不适合现在作为批量视频工厂主线 |
| 辅助增强 | EchoMimicV2/V3 / LivePortrait | 头动、表情、姿态增强 | 可以提升头像自然度，或给静态角色做表情动效 | 不负责完整生产链路，只能作为增强模块 |
| 不推荐主线 | Wav2Lip / SadTalker | 老牌兜底或实验工具 | 可作为故障排查、低配机器兜底参考 | Wav2Lip 存在非商用边界，SadTalker 更适合 demo；二者不应作为客户主方案 |
| 云端参考 | HeyGen 等 | 只看效果，不进交付 | 可用于老板/客户快速对齐“想要的效果” | 不满足本地化要求，不能解锁正式生产 |

一期原则：

1. 数字人片段必须在客户本地服务器生成。
2. 数字人失败不能自动 fallback 成假人占位。
3. 没有真实数字人片段时，成片只能走 `full_broll` 或阻止正式提交。
4. Provider 要可替换，不能把 Cutix 绑定死在单一模型或云服务上。
5. 第一阶段优先验证“稳定批量产出”，不要把重型生成式数字人作为交付承诺。

### 4.1 为什么第一期是 Duix 优先 + MuseTalk 保底

老板明确要求数字人本地化部署后，第一期验收优先用 Duix-Avatar/HeyGem。它更像一个可以交给客户部署的本地数字人服务层。MuseTalk + CosyVoice 继续保留为自研保底链路，避免 Cutix 被单一平台绑定，也方便后续替换 LatentSync 或其他本地模型。

| 维度 | MuseTalk | CosyVoice 2/3 |
|---|---|---|
| 来源 | 腾讯音乐娱乐 | 阿里通义/ModelScope 生态 |
| 开源协议 | MIT（仍需复核依赖模型和第三方权重许可） | Apache 2.0（仍需复核具体模型权重条款） |
| 中文支持 | 良好，适合中文口播 | 中文 TTS 和声音克隆能力强 |
| 核心能力 | 音频驱动唇形同步，生成数字人口播片段 | 文案转语音，支持按 IP 维护声音档案 |
| 部署 | 单独封装成本地 HTTP 服务，接 Cutix `/api/digital-human` | 通过 FastAPI 或兼容服务接 Cutix `/api/tts` |
| 与 Cutix 的关系 | 只负责每个 scene 的数字人片段 | 只负责每个 scene 的音频与字幕时间轴 |

保留 MuseTalk/CosyVoice 不是因为它们画质一定最强，而是因为它们最适合做 Cutix 自研保底：本地部署、可分段、可排队、可失败重试、可被 Remotion 二次合成。客户要的是批量商业 IP 视频工厂，主链路稳定性比单条 demo 的惊艳程度更重要。

### 4.1.1 本地数字人验证顺序

1. 先部署 Duix-Avatar/HeyGem 本地服务，用 Cutix 的本地 HTTP Provider 触发生成。
2. 如果 Duix 原生接口与 Cutix 契约不一致，补 `duix-adapter`，让 Cutix 仍只面对统一 `videoUrl/alphaVideoUrl/statusUrl`。
3. 同一 IP 连续生成 20 个 scene，检查 GPU 显存泄漏、队列阻塞、失败重试和磁盘增长。
4. 并行拿一个绿幕半身 avatar 跑通 `CosyVoice -> MuseTalk -> alpha WebM -> Remotion`，作为自研保底。
5. 如果 Duix/MuseTalk 质量不够，再把 LatentSync 接成第二个 Provider，而不是重写 Cutix 主流程。

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
| 数字人 | Duix-Avatar/HeyGem（验收优先）+ MuseTalk（自研保底）+ LatentSync（高清备选） |
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
- [x] HTTP 数字人本地 MP4 alpha 兜底（MVP：HTTP provider 未返回 alpha 时对 `/output/...mp4` 进行 chromakey 转 WebM）
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
- [x] `videoPlan` 严格 Schema 校验 + 自动修复（MVP：统一 schema 模块，script/selection/render 共用）
- [ ] `videoPlan` 版本迁移 + 人工锁定 + 任务失败复用
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
- 新增 Worker 心跳与状态 API：`platform/data/worker-state/` 记录 Worker 在线、空闲/处理中、当前任务和处理数量；`GET /api/worker-status` 汇总 Worker 健康状态和 queued/running/failed/canceled 队列数，前端顶部不再硬编码 Worker 数。
- 新增排队任务取消 MVP：`POST /api/render-tasks/[taskId]/cancel` 会把还没进入渲染的任务标记为 `canceled`；前端任务卡显示“取消”按钮和取消状态，进程内批量队列与独立 Render Worker 都会跳过已取消任务。
- 新增 `videoPlan` 严格校验/修复 MVP：`src/lib/video-plan-schema.ts` 统一定义 schemaVersion、场景、布局、素材槽、字幕和转场规则；`/api/script` 负责生成规范 plan，`/api/selection` 和 `/api/render` 会在消费前自动校验并修复缺失/损坏的 plan。
- 新增数字人占位隔离 MVP：未接生产数字人时只能生成测试占位片段，测试片段带 `productionReady = false`，前端会禁止继续提交最终成片；生产 HTTP API/MuseTalk 失败时不会再无感 fallback 成假片段。
- 新增数字人 HTTP API 契约 MVP：`/api/digital-human` 的 HTTP provider 可接同步返回视频的服务，也可接先返回 `statusUrl/pollUrl` 的异步服务；轮询间隔和超时可用环境变量配置，接口协议写入 `docs/digital-human-http-api.md`。
- 新增 IP 级数字人角色档案 MVP：`BrandConfig` 增加 `digitalHuman` 档案，品牌配置 UI 可保存角色名称、声音标识、角色参考素材路径和备注；`/api/digital-human` 会把当前 IP 的角色信息传给 HTTP API，并让 MuseTalk 优先使用该 IP 的参考素材路径。

### 下一步

- 这一步仍是本地文件台账 + Node Worker 的 MVP，不是最终生产队列。下一步应接入 Redis/BullMQ，实现多 Worker 并发、运行中任务超时/中断、失败重试策略和完整错误日志。

## 13. 2026-06-06 推进记录

### 已完成：本地数字人交付路线复核

- 老板明确要求数字人本地化部署后，Cutix 不再把 HeyGen、D-ID、Synthesia 等云端 API 作为生产主线；云端服务只能用于效果参考或早期对比。
- 第一优先级固定为 `Duix-Avatar / HeyGem`：作为客户验收主线，用本地服务证明“数字人可部署在客户服务器，并由 Cutix 本地触发生成”。
- 一期保底链路固定为 `CosyVoice + MuseTalk`：用本地 TTS + 本地 lip-sync 保证系统不被单一数字人平台绑定。
- 高清替换位固定为 `LatentSync`：当 MuseTalk 或 Duix 的口型/画质不过关时，按同一 `/api/digital-human` Provider 契约替换，不重写主系统。
- `LiveTalking / EchoMimicV2 / LivePortrait` 只进入二期增强或实时互动研究；`Wav2Lip / SadTalker` 只做应急对照，不作为商业批量视频工厂的主线。
- 详细选型依据已经写入 `docs/local-digital-human-selection.md`。

### 已完成：Web 端启动 Render Worker MVP

- 新增 `POST /api/render-worker/start`，Web 后台可以一键启动本地 `npm run worker:render`，不再要求用户打开终端手工启动 Worker。
- 启动接口会先检查 30 秒内有心跳的 render worker；已有健康 Worker 时直接返回在线状态，避免重复启动。
- 前端“任务状态”卡片增加“启动 Worker”按钮，在线后自动禁用，并延迟刷新 Worker 状态。
- 这仍然是本地 Node Worker MVP，不替代后续 Redis/BullMQ 队列；它的价值是让当前 Web 管理后台更接近“一键生成”的实际操作路径。

### 已完成：Web 端启动本地数字人服务 MVP

- 新增 `POST /api/digital-human-service/start`，Web 后台可以启动项目内的 `digital-human:duix-adapter` 或 `digital-human:musetalk-service`。
- 启动前会访问默认 `/health`，服务已在线时不重复启动；启动后返回默认 `generateEndpoint`，前端自动填入数字人接入草稿。
- 数字人系统设置里新增“启动 Duix Adapter”和“启动 MuseTalk 服务”按钮，减少本地部署时反复开终端的操作。
- 生产就绪摘要不再只看“是否填写 endpoint”，而是把当前 IP 的数字人预检结果纳入状态；没有完成预检时显示“注意”，生成前仍会强制执行预检。

### 已完成：Duix Adapter 结果归档增强

- Duix 查询结果不再只读取少量固定字段，adapter 会递归识别 `videoUrl/video_path/resultUrl/downloadUrl/outputPath/filePath/url/path` 等常见结果字段。
- Duix 返回 HTTP/HTTPS 结果地址时，默认下载归档到 Cutix 本地 `/output/digital-human/duix-adapter/`，让 Remotion 和 FFmpeg 后处理拿到稳定本地资源。
- 新增 `DUIX_ARCHIVE_REMOTE_RESULT`、`DUIX_RESULT_DOWNLOAD_TIMEOUT_MS` 和 `DUIX_ALLOW_UNRESOLVED_RESULT` 环境变量，用于控制远程结果归档、下载超时和调试期路径透传。
- 如果 Duix 返回“已完成”状态但没有可识别的视频结果，adapter 会明确返回失败，避免成片阶段才出现空视频错误。

### 已完成：本地数字人服务启动日志

- Web 启动 `Duix Adapter` 或 `MuseTalk HTTP Service` 时，不再丢弃 stdout/stderr，而是写入 `platform/data/digital-human-services/*.out.log` 和 `*.err.log`。
- 每次 Web 启动会写入对应服务的 `*.json` 状态文件，记录 service、script、pid、endpoint、healthEndpoint 和启动时间。
- 前端启动成功提示会显示 stderr 日志路径，客户现场如果端口占用、模型路径错误或 Duix 原生接口不可达，可以直接定位日志。

### 已完成：本地数字人服务状态面板

- 新增 `GET /api/digital-human-service/status`，汇总 Duix Adapter 和 MuseTalk Service 的 health 状态、最近 Web 启动 state、stdout/stderr 日志尾部。
- Web 系统设置里的本地服务区域会显示在线/离线、PID、脚本名和最近日志片段，便于客户现场排查启动失败和路径映射问题。

### 下一步

- 跑通 `Cutix -> Duix/HeyGem 本地服务 -> /api/digital-human -> Remotion -> MP4` 的真实样片，不再接受无声占位或纯 demo 输出。
- 准备客户可授权的绿幕半身数字人素材，验证 alpha/绿幕抠像进入 Remotion 的稳定性。
- 用真实 Duix/HeyGem 返回样本继续补齐 `duix-adapter` 字段兼容，尤其是原生任务状态、结果路径和错误码。
- 继续推进 Redis/BullMQ 或等价队列化实现，把当前本地文件队列升级为可并发、可重试、可恢复的生产队列。
