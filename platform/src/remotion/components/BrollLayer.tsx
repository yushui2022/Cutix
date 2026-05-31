import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export const BrollLayer: React.FC<{
  videoSrc?: string;
  images?: string[];
  fallbackColor: string;
}> = ({ videoSrc, images, fallbackColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Cycle through images if provided
  const imageIndex = images?.length
    ? Math.floor(frame / (fps * 3)) % images.length
    : 0;

  if (videoSrc) {
    return (
      <div
        style={{
          position: "absolute",
          top: "60%",
          left: 0,
          width: "100%",
          height: "30%",
          overflow: "hidden",
          borderTop: `2px solid ${fallbackColor}44`,
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

  if (images && images.length > 0) {
    return (
      <div
        style={{
          position: "absolute",
          top: "60%",
          left: 0,
          width: "100%",
          height: "30%",
          overflow: "hidden",
          borderTop: `2px solid ${fallbackColor}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111",
        }}
      >
        <img
          src={images[imageIndex]}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: interpolate(frame % (fps * 3), [0, fps * 0.3], [0, 1]),
          }}
        />
      </div>
    );
  }

  // Placeholder: animated data cards
  const card1X = interpolate(frame % (fps * 4), [0, fps * 0.5, fps * 3.5, fps * 4], [-300, 0, 0, -300]);
  const card2X = interpolate((frame + fps * 2) % (fps * 4), [0, fps * 0.5, fps * 3.5, fps * 4], [300, 0, 0, 300]);

  return (
    <div
      style={{
        position: "absolute",
        top: "60%",
        left: 0,
        width: "100%",
        height: "30%",
        borderTop: `2px solid ${fallbackColor}44`,
        background: "linear-gradient(180deg, #111, #1a1a2e)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 24px",
          background: `${fallbackColor}22`,
          borderRadius: 12,
          border: `1px solid ${fallbackColor}44`,
          color: "#fff",
          fontSize: 16,
          fontWeight: 600,
          transform: `translateX(${card1X}px)`,
        }}
      >
        服务 200+ 门店
      </div>
      <div
        style={{
          padding: "16px 24px",
          background: `${fallbackColor}22`,
          borderRadius: 12,
          border: `1px solid ${fallbackColor}44`,
          color: "#fff",
          fontSize: 16,
          fontWeight: 600,
          transform: `translateX(${card2X}px)`,
        }}
      >
        转化率提升 40%
      </div>
    </div>
  );
};
