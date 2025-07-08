// src/components/admin/AdminLayout.tsx
import { NavLink, Outlet } from 'react-router-dom';
import './AdminLayout.css'; // [수정] 보내주신 CSS 파일 경로로 수정했습니다.

// [추가] react-icons를 import 합니다.
import { FiGrid, FiShoppingCart, FiPackage, FiUsers, FiTag, FiMessageSquare, FiCpu, FiPlusSquare, FiLogOut } from 'react-icons/fi';

const AdminLayout = () => {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <h1 className="admin-title">소도몰 관리</h1>
        <nav className="admin-nav">
          <NavLink to="/admin/dashboard" className="admin-nav-link">
            <FiGrid /><span>대시보드</span>
          </NavLink>
          <NavLink to="/admin/orders" className="admin-nav-link">
            <FiShoppingCart /><span>주문 관리</span>
          </NavLink>
          
          {/* 상품 관리 메뉴 */}
          <div>
            <NavLink to="/admin/products" className="admin-nav-link">
              <FiPackage /><span>상품 목록</span>
            </NavLink>
            {/* [추가] 상품 목록 하위에 등록 링크를 추가합니다. */}
            <div style={{ marginLeft: '20px', marginTop: '2px' }}>
              <NavLink to="/admin/products/add" className="admin-nav-link sub-link">
                <FiPlusSquare /><span>새 상품 등록</span>
              </NavLink>
            </div>
          </div>

          <NavLink to="/admin/users" className="admin-nav-link">
            <FiUsers /><span>고객 관리</span>
          </NavLink>
          <NavLink to="/admin/coupons" className="admin-nav-link">
            <FiTag /><span>쿠폰 관리</span>
          </NavLink>
          <NavLink to="/admin/encore" className="admin-nav-link">
            <FiMessageSquare /><span>앵콜 요청 관리</span>
          </NavLink>
          <NavLink to="/admin/board" className="admin-nav-link">
            <FiMessageSquare /><span>공구 요청 관리</span>
          </NavLink>
          <NavLink to="/admin/ai-register" className="admin-nav-link">
            <FiCpu /><span>AI 상품 등록</span>
          </NavLink>
        </nav>
        <div className="admin-footer">
          <NavLink to="/" className="admin-nav-link">
            <FiLogOut /><span>쇼핑몰로 돌아가기</span>
          </NavLink>
        </div>
      </aside>
      <main className="admin-main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;