import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer", "remotion"],
};

export default nextConfig;
