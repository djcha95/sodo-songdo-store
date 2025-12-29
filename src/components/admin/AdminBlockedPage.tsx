// src/components/admin/AdminBlockedPage.tsx

import React from "react";
import { Link, useLocation } from "react-router-dom";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { ShieldAlert } from "lucide-react";
import "./AdminBlockedPage.css";

interface AdminBlockedPageProps {
  title?: string;
  message?: string;
  reason?: "hidden" | "disabled" | "not_ready";
}

/**
 * ✅ 숨김/차단된 관리자 라우트 안내 페이지
 * - “메뉴에서 숨겼지만(또는 폐기) URL로 직접 접근”을 방지
 * - 초보자에게는 “왜 안 되는지 / 어디로 가야 하는지”를 명확히 안내
 */
const AdminBlockedPage: React.FC<AdminBlockedPageProps> = ({
  title = "접근이 제한된 기능입니다",
  message = "이 기능은 현재 운영 정책상 숨김/차단되어 있습니다. 필요한 경우 마스터에게 문의하세요.",
  reason = "hidden",
}) => {
  const location = useLocation();

  const badge =
    reason === "hidden"
      ? "숨김(차단)"
      : reason === "disabled"
      ? "비활성화"
      : "준비 중";

  return (
    <div className="admin-page-container admin-blocked-page">
      <AdminPageHeader
        title={title}
        subtitle={`요청 경로: ${location.pathname}`}
        icon={<ShieldAlert size={28} />}
        priority="low"
      />

      <div className="blocked-card">
        <div className="blocked-badge">{badge}</div>
        <p className="blocked-message">{message}</p>

        <div className="blocked-actions">
          <Link to="/admin/dashboard" className="blocked-btn primary">
            대시보드로 이동
          </Link>
          <Link to="/admin/orders" className="blocked-btn">
            주문 관리로 이동
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminBlockedPage;


