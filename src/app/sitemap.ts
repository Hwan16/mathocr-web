import type { MetadataRoute } from "next";

const SITE_URL = "https://mathocr.ai.kr";

// lastModified는 "페이지 내용이 실제로 바뀐 날"이다 — 빌드 시각(new Date())을 쓰면
// 전 페이지가 매 배포마다 바뀐 것으로 찍혀 구글이 이 값을 신뢰하지 않는다.
// 페이지 본문을 수정하면 해당 줄 날짜도 함께 갱신할 것.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: "2026-09-25",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/report`,
      lastModified: "2026-07-09",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/help/hwp-repair`,
      lastModified: "2026-07-13",
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: "2026-08-26",
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: "2026-07-22",
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
