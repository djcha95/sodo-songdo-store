// src/admin/adminHiddenRoutes.ts

/**
 * ✅ 숨김/차단 대상 관리자 라우트 목록(단일 소스)
 * - 라우트 차단(main.tsx)과 “숨김됨 리스트 표시(AdminSidebar)”에서 공통으로 사용합니다.
 * - 운영 정책이 바뀌면 여기만 수정하면 됩니다.
 */
export const ADMIN_HIDDEN_ROUTES: Array<{ path: string; title: string; message: string }> = [
  {
    path: "board",
    title: "게시판 관리는 숨김 처리되었습니다",
    message: "현재 운영에서는 게시판 관리 기능을 사용하지 않습니다.",
  },
  {
    path: "ai-product",
    title: "AI 상품 추천은 숨김 처리되었습니다",
    message: "현재 운영에서는 AI 추천 기능을 사용하지 않습니다.",
  },
  {
    path: "encore",
    title: "앵콜 관리는 숨김 처리되었습니다",
    message: "현재 운영에서는 앵콜 관리 기능을 사용하지 않습니다.",
  },
  {
    path: "coupon",
    title: "쿠폰 관리는 숨김 처리되었습니다",
    message: "현재 운영에서는 쿠폰 관리 기능을 사용하지 않습니다.",
  },
  {
    path: "categories",
    title: "카테고리 관리는 숨김 처리되었습니다",
    message: "현재 운영에서는 카테고리 관리 기능을 사용하지 않습니다.",
  },
  {
    // Dashboard에 링크가 남아있을 수 있어 안전하게 차단 안내 페이지로 연결
    path: "events/*",
    title: "추첨 이벤트 관리는 현재 준비 중입니다",
    message: "현재 운영에서는 추첨 이벤트 관리 화면이 제공되지 않습니다.",
  },
];


