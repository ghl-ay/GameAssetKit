import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { NineSliceClient } from "./client";

const tool = TOOLS.find((t) => t.key === "nine-slice")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "九宫格切分",
    "9-slice工具",
    "九宫格切片",
    "UI边框切图",
    "nine-patch",
    "圆角边框切分",
    "九宫格拉伸",
    "游戏UI切图",
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

export default function NineSlicePage() {
  return <NineSliceClient description={tool.description} />;
}
