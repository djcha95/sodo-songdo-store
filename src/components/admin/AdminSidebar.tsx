// src/components/admin/AdminSidebar.tsx

import { NavLink, Link } from 'react-router-dom';
import React from 'react';
import './AdminSidebar.css';
import {
  Home, Package, ShoppingCart, Users, ExternalLink, Menu, Zap, PlusSquare, Wallet,
  CalendarCheck, ClipboardList, Settings // 👈 Settings 추가
} from 'lucide-react';

interface AdminSidebarProps {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

const MenuItem = ({ to, icon, text, isSidebarOpen, end = false }: { to: string; icon: React.ReactNode; text: string; isSidebarOpen: boolean; end?: boolean; }) => (
  <li className="menu-item">
    <NavLink to={to} title={!isSidebarOpen ? text : undefined} end={end}>
      {icon}
      {isSidebarOpen && <span>{text}</span>}
    </NavLink>
  </li>
);

const AdminSidebar: React.FC<AdminSidebarProps> = ({ isSidebarOpen, toggleSidebar }) => {

  return (
    <aside className={`admin-sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <button
          className="sidebar-toggle-btn"
          onClick={toggleSidebar}
          aria-label={isSidebarOpen ? "메뉴 닫기" : "메뉴 펼치기"}
          title={isSidebarOpen ? "메뉴 닫기" : "메뉴 펼치기"}
        >
          <Menu size={24} />
        </button>
        {isSidebarOpen && <h1 className="sidebar-title">관리자페이지</h1>}
      </div>

      <nav className="sidebar-nav">
        <ul>
          <MenuItem to="/admin/dashboard" icon={<Home size={18} />} text="대시보드" isSidebarOpen={isSidebarOpen} end={true} />
          <MenuItem 
            to="/admin/pickup-check" 
            icon={<CalendarCheck size={18} />} 
            text="수진이의 픽업체쿠!" 
            isSidebarOpen={isSidebarOpen} 
          />
          <MenuItem to="/admin/quick-check" icon={<Zap size={18} />} text="빠른 예약확인" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/prepaid-check" icon={<Wallet size={18} />} text="선입금 관리" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/orders" icon={<ShoppingCart size={18} />} text="주문 통합 관리" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/create-order" icon={<PlusSquare size={18} />} text="새 주문 생성" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/users" icon={<Users size={18} />} text="고객 관리" isSidebarOpen={isSidebarOpen} />
          {/* ⬇️ [추가] 재고 관리 메뉴 */}
          <MenuItem to="/admin/stock" icon={<ClipboardList size={18} />} text="현장판매 재고" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/products" icon={<Package size={18} />} text="상품 목록" isSidebarOpen={isSidebarOpen} end={true} />
          <MenuItem to="/admin/products/add" icon={<PlusSquare size={18} />} text="새 상품 등록" isSidebarOpen={isSidebarOpen} />
          {/* 👇 [추가] 시스템 관리 메뉴 */}
<div className="my-2 border-t border-gray-700/50 mx-2"></div> {/* 구분선 (선택사항) */}
<MenuItem to="/admin/tools" icon={<Settings size={18} />} text="시스템 관리" isSidebarOpen={isSidebarOpen} />
        
        </ul>
      </nav>

      <div className="sidebar-footer">
        <Link to="/" className="customer-page-quick-link" title="고객 페이지로 이동">
          <ExternalLink size={16} />
          {isSidebarOpen && <span>고객 페이지 바로가기</span>}
        </Link>
      </div>
    </aside>
  );
};

export default AdminSidebar;