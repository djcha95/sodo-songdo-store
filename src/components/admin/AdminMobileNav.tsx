// src/components/admin/AdminMobileNav.tsx

import { NavLink } from 'react-router-dom';
import { Home, CalendarCheck, Zap, Package, Users } from 'lucide-react';
import './AdminMobileNav.css';

const AdminMobileNav = () => {
  return (
    <nav className="admin-mobile-nav">
      <NavLink to="/admin/dashboard" className="mobile-nav-item" end>
        <Home size={20} />
        <span>대시보드</span>
      </NavLink>
      <NavLink to="/admin/pickup-check" className="mobile-nav-item">
        <CalendarCheck size={20} />
        <span>픽업</span>
      </NavLink>
      <NavLink to="/admin/quick-check" className="mobile-nav-item">
        <Zap size={20} />
        <span>빠른확인</span>
      </NavLink>
      <NavLink to="/admin/products" className="mobile-nav-item" end>
        <Package size={20} />
        <span>상품</span>
      </NavLink>
      <NavLink to="/admin/users" className="mobile-nav-item" end>
        <Users size={20} />
        <span>고객</span>
      </NavLink>
    </nav>
  );
};

export default AdminMobileNav;


















