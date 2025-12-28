// src/components/admin/AdminSidebar.tsx

import { NavLink, Link } from 'react-router-dom';
import React from 'react';
import { useAuth } from '@/context/AuthContext';
import './AdminSidebar.css';
import {
  Home, Package, ShoppingCart, Users, ExternalLink, Menu, Zap, PlusSquare, Wallet,
  CalendarCheck, ClipboardList, Settings, AlertTriangle
} from 'lucide-react';
import MenuGroup from './MenuGroup';

interface AdminSidebarProps {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

const MenuItem = ({ to, icon, text, isSidebarOpen, end = false, variant = 'normal' }: { 
  to: string; 
  icon: React.ReactNode; 
  text: string; 
  isSidebarOpen: boolean; 
  end?: boolean;
  variant?: 'normal' | 'danger';
}) => (
  <li className={`menu-item ${variant === 'danger' ? 'menu-item-danger' : ''}`}>
    <NavLink to={to} title={!isSidebarOpen ? text : undefined} end={end}>
      {icon}
      {isSidebarOpen && <span>{text}</span>}
    </NavLink>
  </li>
);

const AdminSidebar: React.FC<AdminSidebarProps> = ({ isSidebarOpen, toggleSidebar }) => {
  const { userDocument } = useAuth();
  const isMaster = userDocument?.role === 'master';

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
        {/* 1. 일일 업무 그룹 */}
        <MenuGroup 
          title="일일 업무" 
          icon={<CalendarCheck size={16} />}
          isSidebarOpen={isSidebarOpen}
          priority="high"
        >
          <MenuItem to="/admin/dashboard" icon={<Home size={22} />} text="대시보드" isSidebarOpen={isSidebarOpen} end={true} />
          <MenuItem 
            to="/admin/pickup-check" 
            icon={<CalendarCheck size={22} />} 
            text="픽업 체크" 
            isSidebarOpen={isSidebarOpen} 
          />
          <MenuItem to="/admin/quick-check" icon={<Zap size={22} />} text="빠른 예약확인" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/prepaid-check" icon={<Wallet size={22} />} text="선입금 관리" isSidebarOpen={isSidebarOpen} />
        </MenuGroup>

        {/* 2. 상품 & 주문 그룹 */}
        <MenuGroup 
          title="상품 & 주문" 
          icon={<Package size={16} />}
          isSidebarOpen={isSidebarOpen}
          priority="normal"
        >
          <MenuItem to="/admin/products" icon={<Package size={22} />} text="상품 목록" isSidebarOpen={isSidebarOpen} end={true} />
          <MenuItem to="/admin/products/add" icon={<PlusSquare size={22} />} text="새 상품 등록" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/orders" icon={<ShoppingCart size={22} />} text="주문 통합 관리" isSidebarOpen={isSidebarOpen} />
          <MenuItem to="/admin/stock" icon={<ClipboardList size={22} />} text="재고 관리" isSidebarOpen={isSidebarOpen} />
        </MenuGroup>

        {/* 3. 고객 관리 그룹 */}
        <MenuGroup 
          title="고객 관리" 
          icon={<Users size={16} />}
          isSidebarOpen={isSidebarOpen}
          priority="normal"
        >
          <MenuItem to="/admin/users" icon={<Users size={22} />} text="고객 관리" isSidebarOpen={isSidebarOpen} />
        </MenuGroup>

        {/* 5. 위험 기능 그룹 (시각적으로 분리) */}
        {isSidebarOpen && (
          <div className="menu-group-danger">
            <div className="menu-group-header-danger">
              <AlertTriangle size={18} />
              <span>위험 기능</span>
            </div>
            <ul className="menu-group-list">
              <MenuItem 
                to="/admin/create-order" 
                icon={<PlusSquare size={22} />} 
                text="새 주문 생성" 
                isSidebarOpen={isSidebarOpen}
                variant="danger"
              />
              {isMaster && (
                <MenuItem 
                  to="/admin/tools" 
                  icon={<Settings size={22} />} 
                  text="시스템 관리" 
                  isSidebarOpen={isSidebarOpen}
                  variant="danger"
                />
              )}
            </ul>
          </div>
        )}
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