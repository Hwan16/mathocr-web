// 내 파일함 폴더 아이콘(선) — 마이페이지·내 파일함 헤더 메뉴와 홈 소개 카드에서 같은 모양으로 쓴다.
// iconify(클라이언트 등록 뒤에 그려짐) 대신 SVG를 직접 넣어 첫 화면부터 보이게 한다.
export default function FolderIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
      <path d="M3 10.5h18" />
    </svg>
  );
}
