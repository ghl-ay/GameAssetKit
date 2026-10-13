import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { PaletteExtractClient } from "./client";

const tool = TOOLS.find((t) => t.key === "palette-extract")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "调色板提取",
    "图片取色",
    "颜色统计",
    "主色提取",
    "色板生成",
    "颜色量化",
    "配色分析",
    "在线取色工具",
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

export default function PaletteExtractPage() {
  return <PaletteExtractClient description={tool.description} />;
}
