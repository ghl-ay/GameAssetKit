import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { PngOptimizeClient } from "./client";

const tool = TOOLS.find((t) => t.key === "png-optimize")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "PNG优化",
    "PNG压缩",
    "PNG无损压缩",
    "调色板压缩",
    "图片瘦身",
    "减小PNG体积",
    "游戏包体优化",
    "在线PNG压缩",
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

export default function PngOptimizePage() {
  return <PngOptimizeClient description={tool.description} />;
}
