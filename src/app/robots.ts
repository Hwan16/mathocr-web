import type { MetadataRoute } from "next";

const SITE_URL = "https://mathocr.ai.kr";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // 로그인·관리자·API 등 검색에 노출될 필요 없는 경로
      disallow: ["/admin", "/dashboard", "/auth/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
