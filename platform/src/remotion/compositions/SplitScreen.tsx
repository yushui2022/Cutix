import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { DigitalHumanLayer } from "../components/DigitalHumanLayer";
import { BrollLayer } from "../components/BrollLayer";
import { SubtitleBar } from "../components/SubtitleBar";
import { mediaSrc } from "../media";

type SubtitleWord = {
  text: string;
  startMs: number;
  endMs: number;
};

type Scene = {
  id?: string;
  role?: string;
  layout: "full_dh" | "dh_top_broll_bottom" | "broll_top_dh_bottom" | "full_broll";
  startSec: number;
  durationSec: number;
  digitalHumanVideo?: string;
  brollVideo?: string;
  brollImages?: string[];
  audioUrl?: string;
  subtitleWords: SubtitleWord[];
  overlayText?: string;
};

type SplitScreenProps = {
  brand: {
    name: string;
    primaryColor: string;
    secondaryColor: string;
    logoText: string;
  };
  scenes: Scene[];
  bgmUrl?: string;
};

const SceneView: React.FC<{
  brand: SplitScreenProps["brand"];
  scene: Scene;
}> = ({ brand, scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isDhVisible = scene.layout !== "full_broll";
  const isBrollVisible = scene.layout !== "full_dh";
  const dhTop = scene.layout === "broll_top_dh_bottom" ? "60%" : "0%";
  const dhHeight = scene.layout === "full_dh" ? "90%" : scene.layout === "broll_top_dh_bottom" ? "30%" : "60%";
  const brollTop = scene.layout === "dh_top_broll_bottom" ? "60%" : "0%";
  const brollHeight = scene.layout === "full_broll" ? "90%" : scene.layout === "broll_top_dh_bottom" ? "60%" : "30%";
  const sceneAudio = mediaSrc(scene.audioUrl);
  const fadeIn = interpolate(frame, [0, fps * 0.25], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      {sceneAudio && <Audio src={sceneAudio} volume={1} />}

      {isDhVisible && (
        <div
          style={{
            position: "absolute",
            top: dhTop,
            left: 0,
            width: "100%",
            height: dhHeight,
            opacity: fadeIn,
            zIndex: 3,
          }}
        >
          <DigitalHumanLayer
            videoSrc={scene.digitalHumanVideo}
            fallbackColor={brand.primaryColor}
            label={brand.name}
          />
        </div>
      )}

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

      {isBrollVisible && (
        <div
          style={{
            position: "absolute",
            top: brollTop,
            left: 0,
            width: "100%",
            height: brollHeight,
            opacity: fadeIn,
            zIndex: 2,
          }}
        >
          <BrollLayer
            videoSrc={scene.brollVideo}
            images={scene.brollImages}
            fallbackColor={brand.primaryColor}
          />
        </div>
      )}

      {scene.overlayText && (
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: 0,
            width: "100%",
            textAlign: "center",
            fontSize: 58,
            fontWeight: 800,
            color: "#fff",
            textShadow: "0 4px 20px rgba(0,0,0,0.8)",
            padding: "0 56px",
            opacity: fadeIn,
            zIndex: 6,
          }}
        >
          {scene.overlayText}
        </div>
      )}

      <SubtitleBar words={scene.subtitleWords} accentColor={brand.primaryColor} />
    </AbsoluteFill>
  );
};

export const SplitScreen: React.FC<SplitScreenProps> = ({ brand, scenes, bgmUrl }) => {
  const { fps } = useVideoConfig();
  const bgm = mediaSrc(bgmUrl);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${brand.secondaryColor}, ${brand.primaryColor}22)`,
      }}
    >
      {bgm && <Audio src={bgm} volume={0.12} loop />}

      {scenes.map((scene, index) => (
        <Sequence
          durationInFrames={Math.max(1, Math.round(scene.durationSec * fps))}
          from={Math.round(scene.startSec * fps)}
          key={scene.id ?? `${scene.layout}-${index}`}
        >
          <SceneView brand={brand} scene={scene} />
        </Sequence>
      ))}

      <div
        style={{
          position: "absolute",
          top: 32,
          right: 32,
          padding: "9px 18px",
          background: "rgba(0,0,0,0.48)",
          borderRadius: 24,
          color: "#fff",
          fontSize: 24,
          fontWeight: 700,
          opacity: 0.78,
          zIndex: 20,
        }}
      >
        {brand.logoText}
      </div>
    </AbsoluteFill>
  );
};
