import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

type SubtitleWord = {
  text: string;
  startMs: number;
  endMs: number;
};

export const SubtitleBar: React.FC<{
  words: SubtitleWord[];
  accentColor: string;
}> = ({ words, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: "10%",
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 40px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.15em",
          fontSize: 36,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {words.map((w, i) => {
          const isActive = currentMs >= w.startMs && currentMs <= w.endMs;
          return (
            <span
              key={i}
              style={{
                color: isActive ? accentColor : "rgba(255,255,255,0.6)",
                transition: "color 0.1s",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
