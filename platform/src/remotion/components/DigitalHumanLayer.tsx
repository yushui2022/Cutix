import { AbsoluteFill, Video, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { mediaSrc } from "../media";

export const DigitalHumanLayer: React.FC<{
  videoSrc?: string;
  fallbackColor: string;
  label: string;
}> = ({ videoSrc, fallbackColor, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // subtle floating animation
  const floatY = interpolate(
    Math.sin((frame / fps) * 1.5),
    [-1, 1],
    [-5, 5],
  );

  if (videoSrc) {
    const src = mediaSrc(videoSrc) ?? videoSrc;

    return (
      <AbsoluteFill
        style={{
          overflow: "hidden",
          transform: `translateY(${floatY}px)`,
        }}
      >
        <Video
          src={src}
          loop
          volume={0}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${fallbackColor}22, ${fallbackColor}08)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `translateY(${floatY}px)`,
      }}
    >
      {/* Placeholder digital human silhouette */}
      <div
        style={{
          width: 200,
          height: 240,
          borderRadius: "50% 50% 0 0",
          background: `linear-gradient(180deg, ${fallbackColor}44, ${fallbackColor}22)`,
          border: `3px solid ${fallbackColor}66`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: `${fallbackColor}88`,
            marginBottom: 12,
          }}
        />
        <div
          style={{
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            opacity: 0.8,
          }}
        >
          {label}
        </div>
      </div>
    </AbsoluteFill>
  );
};
