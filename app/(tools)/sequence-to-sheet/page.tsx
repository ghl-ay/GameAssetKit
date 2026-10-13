import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { SequenceToSheetClient } from "./client";

const tool = TOOLS.find((t) => t.key === "sequence-to-sheet")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "序列帧打包",
    "序列图合成",
    "spritesheet生成",
    "帧动画合并",
    "序列帧图集",
    "批量图片拼图",
    "动画帧打包",
    "在线序列帧工具",
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

export default function SequenceToSheetPage() {
  return <SequenceToSheetClient description={tool.description} />;
}
