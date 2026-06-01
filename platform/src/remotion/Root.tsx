import { Composition } from "remotion";
import { SplitScreen } from "./compositions/SplitScreen";

const fps = 30;

const defaultProps = {
  brand: {
    name: "老王餐饮",
    primaryColor: "#E7333F",
    secondaryColor: "#1A1A2E",
    logoText: "老王餐饮",
  },
  scenes: [
    {
      id: "hook",
      layout: "full_dh" as const,
      startSec: 0,
      durationSec: 5,
      subtitleWords: [
        { text: "普通", startMs: 0, endMs: 400 },
        { text: "餐饮门店", startMs: 400, endMs: 1000 },
        { text: "如何在", startMs: 1000, endMs: 1600 },
        { text: "一个月内", startMs: 1600, endMs: 2500 },
        { text: "提升三倍转化？", startMs: 2500, endMs: 4000 },
        { text: "我是老王", startMs: 4000, endMs: 5000 },
      ],
    },
    {
      id: "pain",
      layout: "dh_top_broll_bottom" as const,
      startSec: 5,
      durationSec: 10,
      subtitleWords: [
        { text: "很多餐饮老板", startMs: 0, endMs: 1200 },
        { text: "客流不少", startMs: 1200, endMs: 2400 },
        { text: "但复购率", startMs: 2400, endMs: 3600 },
        { text: "就是上不去", startMs: 3600, endMs: 5200 },
        { text: "缺的不是流量", startMs: 5200, endMs: 7000 },
        { text: "是标准化转化流程", startMs: 7000, endMs: 10000 },
      ],
    },
    {
      id: "proof",
      layout: "full_broll" as const,
      startSec: 15,
      durationSec: 8,
      subtitleWords: [{ text: "200+ 门店验证的增长模型", startMs: 0, endMs: 8000 }],
      overlayText: "200+ 门店验证的增长模型",
    },
    {
      id: "cta",
      layout: "full_dh" as const,
      startSec: 23,
      durationSec: 7,
      subtitleWords: [
        { text: "现在私信", startMs: 0, endMs: 900 },
        { text: "增长方案", startMs: 900, endMs: 2100 },
        { text: "免费领取", startMs: 2100, endMs: 3300 },
        { text: "完整资料包", startMs: 3300, endMs: 4700 },
        { text: "名额有限", startMs: 4700, endMs: 5900 },
        { text: "先到先得", startMs: 5900, endMs: 7000 },
      ],
    },
  ],
};

type SplitScreenProps = typeof defaultProps;

function durationInFramesFor(props: SplitScreenProps) {
  const totalSec = props.scenes.reduce(
    (max, scene) => Math.max(max, scene.startSec + scene.durationSec),
    1,
  );
  return Math.max(fps, Math.ceil(totalSec * fps));
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      calculateMetadata={({ props }) => ({
        durationInFrames: durationInFramesFor(props as SplitScreenProps),
      })}
      component={SplitScreen}
      defaultProps={defaultProps}
      durationInFrames={durationInFramesFor(defaultProps)}
      fps={fps}
      height={1920}
      id="SplitScreen"
      width={1080}
    />
  );
};
