import { Composition } from "remotion";
import { SplitScreen } from "./compositions/SplitScreen";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SplitScreen"
        component={SplitScreen}
        durationInFrames={30 * 30} // 30fps * 30s = 900 frames
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          brand: {
            name: "老王餐饮",
            primaryColor: "#E7333F",
            secondaryColor: "#1A1A2E",
            logoText: "老王餐饮",
          },
          scenes: [
            {
              layout: "full_dh" as const,
              startSec: 0,
              durationSec: 5,
              subtitleWords: [
                { text: "普通", startMs: 0, endMs: 400 },
                { text: "餐饮门店", startMs: 400, endMs: 1000 },
                { text: "如何在", startMs: 1000, endMs: 1600 },
                { text: "一个月内", startMs: 1600, endMs: 2500 },
                { text: "提升三倍转化？", startMs: 2500, endMs: 4000 },
                { text: "我是老王，", startMs: 4000, endMs: 5000 },
              ],
            },
            {
              layout: "dh_top_broll_bottom" as const,
              startSec: 5,
              durationSec: 10,
              subtitleWords: [
                { text: "很多餐饮老板", startMs: 0, endMs: 1000 },
                { text: "跟我反馈，", startMs: 1000, endMs: 2000 },
                { text: "客流不少，", startMs: 2000, endMs: 3500 },
                { text: "但复购率", startMs: 3500, endMs: 5000 },
                { text: "就是上不去。", startMs: 5000, endMs: 7000 },
                { text: "缺的不是流量，", startMs: 7000, endMs: 8500 },
                { text: "是标准化转化流程。", startMs: 8500, endMs: 10000 },
              ],
            },
            {
              layout: "full_broll" as const,
              startSec: 15,
              durationSec: 8,
              subtitleWords: [
                { text: "已服务 200+ 门店", startMs: 0, endMs: 8000 },
              ],
              overlayText: "200+ 门店验证的增长模型",
            },
            {
              layout: "full_dh" as const,
              startSec: 23,
              durationSec: 7,
              subtitleWords: [
                { text: "现在私信", startMs: 0, endMs: 800 },
                { text: "「增长方案」", startMs: 800, endMs: 2000 },
                { text: "免费领取", startMs: 2000, endMs: 3000 },
                { text: "完整资料包。", startMs: 3000, endMs: 4500 },
                { text: "名额有限，", startMs: 4500, endMs: 5500 },
                { text: "先到先得！", startMs: 5500, endMs: 7000 },
              ],
            },
          ],
        }}
      />
    </>
  );
};
