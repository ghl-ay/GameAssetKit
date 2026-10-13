import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { SheetToSequenceClient } from "./client";

const tool = TOOLS.find((t) => t.key === "sheet-to-sequence")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "序列帧拆分",
    "spritesheet切分",
    "动画帧导出",
    "序列帧提取",
    "图集切帧",
    "帧动画分解",
    "在线切片工具",
    "逐帧导出",
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

export default function SheetToSequencePage() {
  return <SheetToSequenceClient description={tool.description} />;
}
