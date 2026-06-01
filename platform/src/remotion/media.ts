import { staticFile } from "remotion";

export function mediaSrc(src?: string) {
  if (!src) return undefined;
  if (src.startsWith("/")) return staticFile(src.replace(/^\/+/, ""));
  return src;
}
