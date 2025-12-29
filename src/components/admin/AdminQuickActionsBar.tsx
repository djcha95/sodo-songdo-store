// src/components/admin/AdminQuickActionsBar.tsx

import { NavLink } from "react-router-dom";
import { CalendarCheck, Zap, Wallet, ShoppingCart, Package } from "lucide-react";
import "./AdminQuickActionsBar.css";

/**
 * ✅ 관리자 “빠른 실행” 바 (데스크톱 우선)
 * - 초보자도 1~2클릭으로 핵심 업무(픽업/빠른확인/선입금/주문/상품)에 진입
 * - 전체 구조를 갈아엎지 않고 AdminLayout에 얹는 방식
 */
const AdminQuickActionsBar = () => {
  return (
    <div className="admin-quick-actions admin-desktop-only" role="navigation" aria-label="관리자 빠른 실행">
      <NavLink to="/admin/pickup-check" className="quick-action" title="픽업 체크">
        <CalendarCheck size={18} />
        <span>픽업 체크</span>
      </NavLink>
      <NavLink to="/admin/quick-check" className="quick-action" title="빠른 예약확인">
        <Zap size={18} />
        <span>빠른 확인</span>
      </NavLink>
      <NavLink to="/admin/prepaid-check" className="quick-action" title="선입금 관리">
        <Wallet size={18} />
        <span>선입금</span>
      </NavLink>
      <NavLink to="/admin/orders" className="quick-action" title="주문 통합 관리">
        <ShoppingCart size={18} />
        <span>주문</span>
      </NavLink>
      <NavLink to="/admin/products" className="quick-action" title="상품 관리">
        <Package size={18} />
        <span>상품</span>
      </NavLink>
    </div>
  );
};

export default AdminQuickActionsBar;


