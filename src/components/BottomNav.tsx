// src/components/BottomNav.tsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
// FiMessageSquare를 FiShoppingBag으로 교체합니다.
import { FiHome, FiShoppingBag, FiShoppingCart, FiUser, FiSettings } from 'react-icons/fi';
import './BottomNav.css';

const BottomNav = () => {
  const { isAdmin } = useAuth();
  const { cartItemCount } = useCart();

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    return "nav-link" + (isActive ? " active" : "");
  };

  return (
    <nav className="bottom-nav">
      <NavLink to="/" className={getNavLinkClass} end>
        <FiHome />
        <span>홈</span>
      </NavLink>
      {/* '공구 요청'에서 '현장 판매'로 변경 */}
      <NavLink to="/board" className={getNavLinkClass}>
        <FiShoppingBag /> {/* 아이콘 변경 */}
        <span>현장 판매</span> {/* 텍스트 변경 */}
      </NavLink>
      <NavLink to="/cart" className={getNavLinkClass}>
        <div className="cart-icon-wrapper">
          <FiShoppingCart />
          {cartItemCount > 0 && (
            <span className="cart-badge">{cartItemCount}</span>
          )}
        </div>
        <span>장바구니</span>
      </NavLink>
      <NavLink to="/mypage" className={getNavLinkClass}>
        <FiUser />
        <span>마이페이지</span>
      </NavLink>
      
      {isAdmin && (
        <NavLink to="/admin" className={getNavLinkClass}>
          <FiSettings />
          <span>관리자</span>
        </NavLink>
      )}
    </nav>
  );
};

export default BottomNav;