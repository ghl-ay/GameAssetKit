import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Turbopack (Next.js 16 default)
  turbopack: {},
  // Required for @imgly/background-removal ONNX/WASM support;
  // ffmpeg-static resolves its binary via __dirname, so it must stay external.
  serverExternalPackages: ["onnxruntime-node", "sharp", "ffmpeg-static"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@imgly/background-removal/dist/**/*"],
  },
};

export default nextConfig;
