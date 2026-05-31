import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

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
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "60%",
          overflow: "hidden",
          transform: `translateY(${floatY}px)`,
        }}
      >
        <video
          src={videoSrc}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          autoPlay
          loop
          muted
        />
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "60%",
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
    </div>
  );
};
