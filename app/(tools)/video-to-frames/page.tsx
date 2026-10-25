import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { VideoToFramesClient } from "./client";

const tool = TOOLS.find((t) => t.key === "video-to-frames")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "视频转序列帧",
    "视频抽帧",
    "MP4转PNG序列",
    "视频帧提取",
    "在线抽帧工具",
    "spritesheet制作",
    "游戏特效素材",
    "webm透明序列帧",
  ],
  alternates: {
    canonical: `${SITE_URL}${tool.path}`,
  },
  openGraph: {
    title: tool.seoTitle,
    description: tool.seoDescription,
    url: `${SITE_URL}${tool.path}`,
    siteName: SITE_NAME,
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: tool.seoTitle,
    description: tool.seoDescription,
  },
};

export default function VideoToFramesPage() {
  return <VideoToFramesClient description={tool.description} />;
}
