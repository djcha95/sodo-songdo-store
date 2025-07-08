// src/components/admin/AdminSidebar.tsx

import { NavLink } from 'react-router-dom';
import './AdminSidebar.css';
import brandLogo from '@/assets/Sodomall_Logo.png';
import { 
  Home, Package, ShoppingCart, Truck, Users, Star, Bot, 
  ClipboardList, Gift, Image as ImageIcon, MessageSquare, TestTube2 
} from 'lucide-react';
import type React from 'react'; // ✅ 개선 사항: 타입 전용으로 import 하도록 변경

// 재사용성을 위해 메뉴 아이템을 컴포넌트로 분리
const MenuItem = ({ to, icon, text }: { to: string; icon: React.ReactNode; text: string }) => (
  <li className="menu-item">
    <NavLink to={to}>
      {icon}
      <span>{text}</span>
    </NavLink>
  </li>
);

// 메뉴 그룹 제목 컴포넌트
const MenuGroupTitle = ({ title, spacer = false }: { title: string; spacer?: boolean }) => (
  <li className={`menu-group-title ${spacer ? 'menu-group-spacer' : ''}`}>{title}</li>
);

const AdminSidebar = () => {
  return (
    <aside className="admin-sidebar">
      <div className="sidebar-header">
        {/* ✅ 개선 사항: 변수명을 import한 'brandLogo'로 수정 */}
        <img src={brandLogo} alt="소도몰 로고" className="sidebar-logo" />
        <h1 className="sidebar-title">소도몰 관리</h1>
      </div>
      <nav className="sidebar-nav">
        <ul>
          <MenuItem to="/admin/dashboard" icon={<Home size={18} />} text="대시보드" />

          <MenuGroupTitle title="주문 관리" />
          <MenuItem to="/admin/orders" icon={<ShoppingCart size={18} />} text="전체 주문 목록" />
          <MenuItem to="/admin/pickup" icon={<Truck size={18} />} text="빠른 픽업 처리" />

          <MenuGroupTitle title="상품 관리" />
          <MenuItem to="/admin/products" icon={<Package size={18} />} text="상품 목록" />
          <MenuItem to="/admin/categories" icon={<ClipboardList size={18} />} text="카테고리 관리" />
          <MenuItem to="/admin/encore-requests" icon={<Star size={18} />} text="앵콜 요청" />
          <MenuItem to="/admin/ai-product" icon={<Bot size={18} />} text="AI 상품 추천" />

          <MenuGroupTitle title="고객 및 마케팅" />
          <MenuItem to="/admin/users" icon={<Users size={18} />} text="고객 관리" />
          <MenuItem to="/admin/coupons" icon={<Gift size={18} />} text="쿠폰 관리" />
          <MenuItem to="/admin/banners" icon={<ImageIcon size={18} />} text="배너 관리" />

          <MenuGroupTitle title="커뮤니티" />
          <MenuItem to="/admin/board" icon={<MessageSquare size={18} />} text="게시판 관리" />
          
          <MenuGroupTitle title="기타" spacer={true} />
          <MenuItem to="/admin/test" icon={<TestTube2 size={18} />} text="테스트 페이지" />
        </ul>
      </nav>
    </aside>
  );
};

export default AdminSidebar;