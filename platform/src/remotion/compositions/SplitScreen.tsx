import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { DigitalHumanLayer } from "../components/DigitalHumanLayer";
import { BrollLayer } from "../components/BrollLayer";
import { SubtitleBar } from "../components/SubtitleBar";

type SplitScreenProps = {
  brand: {
    name: string;
    primaryColor: string;
    secondaryColor: string;
    logoText: string;
  };
  scenes: {
    layout: "full_dh" | "dh_top_broll_bottom" | "broll_top_dh_bottom" | "full_broll";
    startSec: number;
    durationSec: number;
    digitalHumanVideo?: string;
    brollVideo?: string;
    brollImages?: string[];
    subtitleWords: { text: string; startMs: number; endMs: number }[];
    overlayText?: string;
  }[];
  bgmUrl?: string;
};

export const SplitScreen: React.FC<SplitScreenProps> = ({ brand, scenes, bgmUrl }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentSec = frame / fps;

  // Find the active scene
  const activeScene = scenes.find(
    (s) => currentSec >= s.startSec && currentSec < s.startSec + s.durationSec,
  );

  if (!activeScene) {
    return (
      <AbsoluteFill style={{ background: brand.secondaryColor }} />
    );
  }

  const sceneElapsedMs = (currentSec - activeScene.startSec) * 1000;

  // Adjust subtitles to be relative to scene start
  const adjustedWords = activeScene.subtitleWords.map((w) => ({
    ...w,
    startMs: w.startMs,
    endMs: w.endMs,
  }));

  // Determine layout regions based on layout mode
  const isDhVisible = activeScene.layout !== "full_broll";
  const isBrollVisible = activeScene.layout !== "full_dh";

  const dhTop = activeScene.layout === "broll_top_dh_bottom" ? "60%" : "0%";
  const dhHeight = activeScene.layout === "full_dh" ? "100%" : "60%";

  const brollTop = activeScene.layout === "dh_top_broll_bottom" ? "60%" : "0%";
  const brollHeight = activeScene.layout === "full_broll" ? "100%" : activeScene.layout === "broll_top_dh_bottom" ? "60%" : "30%";

  // Fade in effect for scene transitions
  const fadeIn = interpolate(
    frame - activeScene.startSec * fps,
    [0, fps * 0.3],
    [0, 1],
    { extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${brand.secondaryColor}, ${brand.primaryColor}22)`,
      }}
    >
      {/* Background music */}
      {bgmUrl && <Audio src={bgmUrl} volume={0.15} loop />}

      {/* Digital Human Layer */}
      {isDhVisible && (
        <div
          style={{
            position: "absolute",
            top: dhTop,
            left: 0,
            width: "100%",
            height: dhHeight,
            opacity: fadeIn,
          }}
        >
          <DigitalHumanLayer
            videoSrc={activeScene.digitalHumanVideo}
            fallbackColor={brand.primaryColor}
            label={brand.name}
          />
        </div>
      )}

      {/* Separator line between digital human and broll */}
      {isDhVisible && isBrollVisible && (
        <div
          style={{
            position: "absolute",
            top: brollTop,
            left: "5%",
            width: "90%",
            height: 2,
            background: `linear-gradient(90deg, transparent, ${brand.primaryColor}88, transparent)`,
            zIndex: 5,
            opacity: fadeIn,
          }}
        />
      )}

      {/* B-roll Layer */}
      {isBrollVisible && (
        <div
          style={{
            position: "absolute",
            top: brollTop,
            left: 0,
            width: "100%",
            height: brollHeight,
            opacity: fadeIn,
          }}
        >
          <BrollLayer
            videoSrc={activeScene.brollVideo}
            images={activeScene.brollImages}
            fallbackColor={brand.primaryColor}
          />
        </div>
      )}

      {/* Overlay text for full_broll */}
      {activeScene.overlayText && (
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: 0,
            width: "100%",
            textAlign: "center",
            fontSize: 48,
            fontWeight: 800,
            color: "#fff",
            textShadow: "0 4px 20px rgba(0,0,0,0.8)",
            padding: "0 40px",
            opacity: fadeIn,
          }}
        >
          {activeScene.overlayText}
        </div>
      )}

      {/* Subtitle Bar */}
      <SubtitleBar words={adjustedWords} accentColor={brand.primaryColor} />

      {/* Brand logo watermark */}
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 24,
          padding: "6px 14px",
          background: "rgba(0,0,0,0.5)",
          borderRadius: 20,
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          opacity: 0.7,
        }}
      >
        {brand.logoText}
      </div>
    </AbsoluteFill>
  );
};
