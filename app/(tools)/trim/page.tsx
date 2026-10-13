import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { TrimClient } from "./client";

const tool = TOOLS.find((t) => t.key === "trim")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "透明边裁剪",
    "去除空白边",
    "trim工具",
    "PNG留白裁剪",
    "自动裁剪透明区域",
    "图片去边距",
    "批量裁剪空白",
    "精灵图trim",
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

export default function TrimPage() {
  return <TrimClient description={tool.description} />;
}
