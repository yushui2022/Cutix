# Cutix

> 私有化的批量商业短视频生成平台。一个页面，选 IP、点生成、等进度、下载视频。

## 这是什么

Cutix 把"数字人口播 + B-roll 素材 + 字幕 + 品牌元素"在**同一画面**里合成 9:16 竖屏短视频。
端用户的全部操作就是：**进页面 → 选 IP → 点生成 → 下载**。
后台自动完成：LLM 写文案、自动选素材、TTS、数字人唇形同步、Remotion 合成、FFmpeg 后处理。

详细产品形态、用户路径、技术决策见 [`plan.md`](./plan.md)。

## 目录结构

```
cutix/
├── plan.md           产品方案 + 技术路线（先读这个）
├── platform/         产品本体：Next.js 15 + React 19 + Remotion
│   ├── src/app/      Web 页面 + API 路由
│   └── src/remotion/ 视频合成模板（SplitScreen 4 种布局）
└── external/         4 个外部源码，按需魔改适配业务
    ├── remotion/     视频合成引擎源码
    ├── musetalk/     数字人唇形同步
    ├── cosyvoice/    TTS + 声音克隆
    └── smartcut/     无损视频剪辑
```

各 external 项目的用途和魔改方向见 [`external/README.md`](./external/README.md)。

## 跑起来

### 前置依赖
- Node 20+
- FFmpeg（在 PATH 里）
- （后续接真数字人/TTS 时）Python 3.10 + CUDA 12GB+ 显卡

### 启动 demo

```bash
cd platform
npm install
npm run dev
# → http://localhost:3000
```

页面打开后选一个 IP（老王餐饮 / 李总商业 / 张姐美妆），点生成，
约 30 秒后出现可播放/下载的 30s 竖屏视频。

> 当前版本数字人和 B-roll 是占位渲染（彩色块 + 动画），还没接 MuseTalk / CosyVoice。
> 文案是硬编码模板，还没接 LLM。详见 plan.md 里的 Milestones。

## 状态

- [x] M0 端到端 demo：纯 Remotion 合成，占位素材
- [ ] M1 接入 CosyVoice 2（TTS + 音色克隆）
- [ ] M2 接入 MuseTalk（数字人唇形同步）
- [ ] M3 接入 LLM 自动写文案 + 自动选模板
- [ ] M4 资产库（MinIO + PostgreSQL）+ 后台管理
- [ ] M5 批量生成 + 队列 + 进度

## 备注

`external/` 里的 4 个源码已脱离原 git 历史，作为 cutix 仓库的普通文件管理 —
后续会按业务需要直接魔改。如需同步上游更新，手动 diff 即可。
