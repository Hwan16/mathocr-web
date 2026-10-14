import { ARTICLES, SITE_URL } from "@/lib/articles";

// 자료실 새 글 알림(RSS 2.0) — 네이버 서치어드바이저 'RSS 제출'용. 글 목록은 lib/articles.ts 단일 출처.
// 빌드 때 정적으로 만든다(글을 추가해 배포하면 자동 갱신).
export const dynamic = "force-static";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 2026-10-14 → RFC 822 (한국 시간 오전 9시)
function rfc822(date: string) {
  return new Date(`${date}T09:00:00+09:00`).toUTCString();
}

export function GET() {
  const items = [...ARTICLES]
    .sort((a, b) => (a.published < b.published ? 1 : -1))
    .map(
      (a) => `    <item>
      <title>${esc(a.title)}</title>
      <link>${SITE_URL}${a.href}</link>
      <guid isPermaLink="true">${SITE_URL}${a.href}</guid>
      <description>${esc(a.summary)}</description>
      <pubDate>${rfc822(a.published)}</pubDate>
    </item>`
    )
    .join("\n");
  const latest = ARTICLES.reduce((m, a) => (a.date > m ? a.date : m), "1970-01-01");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI MathOCR 자료실</title>
    <link>${SITE_URL}/guides</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>한글 수식 입력부터 수학 시험지 제작까지, 수학 선생님을 위한 팁과 무료 도구</description>
    <language>ko</language>
    <lastBuildDate>${rfc822(latest)}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
