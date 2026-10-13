import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { PaletteSwapClient } from "./client";

const tool = TOOLS.find((t) => t.key === "palette-swap")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "调色板替换",
    "图片换色",
    "颜色替换",
    "队伍色替换",
    "图片换肤",
    "批量改色",
    "色板映射",
    "游戏素材换色",
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

export default function PaletteSwapPage() {
  return <PaletteSwapClient description={tool.description} />;
}
