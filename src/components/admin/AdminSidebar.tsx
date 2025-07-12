// src/components/admin/AdminSidebar.tsx

import { NavLink, Link } from 'react-router-dom';
// ✅ [수정] 사용하지 않는 useState, useEffect 제거
import React from 'react';
import './AdminSidebar.css';
import {
  Home, Package, ShoppingCart, Truck, Users, Star, Bot,
  ClipboardList, Gift, Image as ImageIcon, MessageSquare, TestTube2,
  ExternalLink, Menu, SlidersHorizontal
} from 'lucide-react';

interface AdminSidebarProps {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

const MenuItem = ({ to, icon, text, isSidebarOpen }: { to: string; icon: React.ReactNode; text: string; isSidebarOpen: boolean; }) => (
  <li className="menu-item">
    <NavLink to={to} title={!isSidebarOpen ? text : undefined}>
      {icon}
      {isSidebarOpen && <span>{text}</span>}
    </NavLink>
  </li>
);

const MenuGroupTitle = ({ title, spacer = false, isSidebarOpen }: { title: string; spacer?: boolean; isSidebarOpen: boolean; }) => (
  <>
    {isSidebarOpen && (
      <li className={`menu-group-title ${spacer ? 'menu-group-spacer' : ''}`}>
        {title}
      </li>
    )}
  </>
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
          <MenuItem to="/admin/dashboard" icon={<Home size={18} />} text="대시보드" isSidebarOpen={isSidebarOpen} />

          <MenuGroupTitle title="주문 및 입고" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/orders" icon={<ShoppingCart size={18} />} text="전체 주문 목록" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/pickup" icon={<Truck size={18} />} text="빠른 픽업 처리" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/product-arrivals" icon={<ClipboardList size={18} />} text="상품 입고 관리" isSidebarOpen={isSidebarOpen} />

          <MenuGroupTitle title="상품 관리" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/products" icon={<Package size={18} />} text="상품 목록" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/products/add" icon={<Package size={18} />} text="새 상품 등록" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/products/batch-category" icon={<SlidersHorizontal size={18} />} text="카테고리 일괄 변경" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/categories" icon={<ClipboardList size={18} />} text="카테고리 관리" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/encore-requests" icon={<Star size={18} />} text="앙코르 요청" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/ai-product" icon={<Bot size={18} />} text="AI 상품 추천" isSidebarOpen={isSidebarOpen} />

          <MenuGroupTitle title="고객 및 마케팅" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/users" icon={<Users size={18} />} text="고객 관리" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/coupons" icon={<Gift size={18} />} text="쿠폰 관리" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/banners" icon={<ImageIcon size={18} />} text="배너 관리" isSidebarOpen={isSidebarOpen} />

          <MenuGroupTitle title="커뮤니티 및 기타" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/board" icon={<MessageSquare size={18} />} text="게시판 관리" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/test" icon={<TestTube2 size={18} />} text="테스트 페이지" isSidebarOpen={isSidebarOpen} />
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