// 내 파일함(D-054) — 서버·화면 공용 타입과 표시 규칙(브라우저에서도 쓰므로 node 모듈을 쓰지 않는다).

export type PreviewBlock =
  | { t: "text"; v: string; b?: boolean }
  | { t: "math"; v: string } // LaTeX, 글 안
  | { t: "mathd"; v: string } // LaTeX, 별도 줄
  | { t: "hwp"; v: string } // LaTeX 원본이 없는 한글 수식 — 글자로 보여 준다
  | { t: "br" }
  | { t: "img" } // 그림 자리(미리보기 그림은 첫 그림 하나만)
  | { t: "box"; kind: "condition" | "bogi"; items: PreviewBlock[] }
  | { t: "table"; rows: PreviewBlock[][][] };

export type Preview = {
  v: 1;
  number: number;
  body: PreviewBlock[];
  choices?: { label: string; items: PreviewBlock[] }[];
  answer?: string | null;
};

export type StoredFile = {
  id: string;
  file_name: string;
  size_bytes: number;
  problem_count: number;
  solution_count: number;
  figure_count: number;
  created_at: string;
  expires_at: string;
  file_deleted_at: string | null;
  expired: boolean;
};

/** 보관 기한 단계 — 8일 이상 보통, 7일 이하 주황, 내일·오늘 빨강, 지나면 만료됨. */
export type ExpiryState = "normal" | "soon" | "tomorrow" | "today" | "expired";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 한국 날짜 기준 일 수(0 = 같은 날). */
function kstDayNumber(d: Date): number {
  return Math.floor((d.getTime() + KST_OFFSET_MS) / DAY_MS);
}

export function expiryInfo(f: Pick<StoredFile, "expires_at" | "expired">, now = new Date()) {
  const exp = new Date(f.expires_at);
  const daysLeft = kstDayNumber(exp) - kstDayNumber(now);
  let state: ExpiryState;
  if (f.expired || exp.getTime() < now.getTime()) state = "expired";
  else if (daysLeft <= 0) state = "today";
  else if (daysLeft === 1) state = "tomorrow";
  else if (daysLeft <= 7) state = "soon";
  else state = "normal";
  return { exp, daysLeft, state };
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");

/** 한국 시각 부분 — 브라우저 시간대와 상관없이 KST 로 보여 준다. */
function kstParts(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return {
    y: k.getUTCFullYear(),
    m: k.getUTCMonth() + 1,
    d: k.getUTCDate(),
    wd: WD[k.getUTCDay()],
    hh: pad(k.getUTCHours()),
    mm: pad(k.getUTCMinutes()),
  };
}

/** 11.03 (화) — 올해가 아니면 앞에 연도. */
export function formatDay(d: Date, now = new Date()): string {
  const p = kstParts(d);
  const year = p.y !== kstParts(now).y ? `${p.y}.` : "";
  return `${year}${pad(p.m)}.${pad(p.d)} (${p.wd})`;
}

export function formatDateTime(d: Date, now = new Date()): string {
  const p = kstParts(d);
  return `${formatDay(d, now)} ${p.hh}:${p.mm}`;
}

/** 12월 3일 — 카톡 카드 설명용. */
export function formatMonthDay(d: Date): string {
  const p = kstParts(d);
  return `${p.m}월 ${p.d}일`;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}
