// src/components/BottomNav.tsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { FiHome, FiShoppingBag, FiShoppingCart, FiUser, FiSettings, FiMessageSquare } from 'react-icons/fi';
import './BottomNav.css';

const BottomNav = () => {
  const { isAdmin } = useAuth();
  const { reservationItemCount, waitlistItemCount } = useCart();

  const cartItemCount = reservationItemCount + waitlistItemCount;

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    return "nav-link" + (isActive ? " active" : "");
  };

  return (
    <nav className="bottom-nav">
      <NavLink to="/" className={getNavLinkClass} end>
        <FiHome />
        <span>홈</span>
      </NavLink>
      <NavLink to="/onsite-sale" className={getNavLinkClass}>
        <FiShoppingBag />
        <span>현장 판매</span>
      </NavLink>
      <NavLink to="/cart" className={getNavLinkClass} data-tutorial-id="bottom-nav-cart">
        <div className="cart-icon-wrapper">
          <FiShoppingCart />
          {cartItemCount > 0 && (
            <span className="cart-badge">{cartItemCount}</span>
          )}
        </div>
        <span>장바구니</span>
      </NavLink>
      {/* ✅ [추가] 고객센터 아이콘에 튜토리얼 ID 추가 */}
      <NavLink to="/customer-center" className={getNavLinkClass} data-tutorial-id="bottom-nav-customer-center">
        <FiMessageSquare />
        <span>고객센터</span>
      </NavLink>
      <NavLink to="/mypage" className={getNavLinkClass} data-tutorial-id="bottom-nav-mypage">
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