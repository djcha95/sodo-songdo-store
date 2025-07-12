// src/components/admin/AdminSidebar.tsx

import { NavLink, Link } from 'react-router-dom';
import React, { useState, useEffect } from 'react'; // useState, useEffect 사용
import './AdminSidebar.css';
import {
  Home, Package, ShoppingCart, Truck, Users, Star, Bot,
  ClipboardList, Gift, Image as ImageIcon, MessageSquare, TestTube2,
  ExternalLink, Menu // 햄버거 아이콘 사용
} from 'lucide-react';

interface AdminSidebarProps {
  // AdminLayout에서 isSidebarOpen 상태를 관리하고, 이를 AdminSidebar에 prop으로 전달합니다.
  // AdminLayout은 이 상태를 이용해 main 콘텐츠의 padding-left를 조절합니다.
  isSidebarOpen: boolean;
  toggleSidebar: () => void; // AdminLayout에서 전달받는 토글 함수
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
  // 마우스 오버에 의한 자동 펼침/접힘 로직 (isHovered)은 제거
  // isSidebarOpen 상태는 prop으로 받아오므로, 내부에서 useState로 관리하지 않습니다.

  return (
    <aside className={`admin-sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {/* 햄버거 버튼과 '관리자페이지' 제목을 사이드바 내부에 배치 */}
        <button
          className="sidebar-toggle-btn" // 기존 fixed-toggle-btn 대신 사이드바 내 버튼
          onClick={toggleSidebar}
          aria-label={isSidebarOpen ? "메뉴 닫기" : "메뉴 펼치기"}
          title={isSidebarOpen ? "메뉴 닫기" : "메뉴 펼치기"}
        >
          <Menu size={24} />
        </button>
        {isSidebarOpen && <h1 className="sidebar-title">관리자페이지</h1>} {/* '관리자페이지' 제목 */}
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