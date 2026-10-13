import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { AssetLintClient } from "./client";

const tool = TOOLS.find((t) => t.key === "asset-lint")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "资源体检",
    "图片检测",
    "资源规范检查",
    "2的幂检查",
    "图片体积检查",
    "命名规范检查",
    "重复图片检测",
    "游戏资源检查",
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

export default function AssetLintPage() {
  return <AssetLintClient description={tool.description} />;
}
