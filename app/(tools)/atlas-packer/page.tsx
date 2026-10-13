import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { AtlasPackerClient } from "./client";

const tool = TOOLS.find((t) => t.key === "atlas-packer")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "图集打包",
    "精灵图集",
    "TexturePacker替代",
    "图片合并",
    "图集生成",
    "游戏资源打包",
    "MaxRects装箱",
    "在线图集工具",
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

export default function AtlasPackerPage() {
  return <AtlasPackerClient description={tool.description} />;
}
