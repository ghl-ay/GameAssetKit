import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { AlphaBleedClient } from "./client";

const tool = TOOLS.find((t) => t.key === "alpha-bleed")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "边缘外扩",
    "alpha bleed",
    "透明边黑边修复",
    "颜色外扩",
    "边缘溢出",
    "图集黑边修复",
    "缩放灰边修复",
    "图片预处理",
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

export default function AlphaBleedPage() {
  return <AlphaBleedClient description={tool.description} />;
}
