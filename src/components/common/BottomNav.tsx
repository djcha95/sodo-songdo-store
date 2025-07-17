// src/components/BottomNav.tsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext'; // 상대 경로 수정
import { useCart } from '@/context/CartContext'; // 상대 경로 수정
import { FiHome, FiShoppingBag, FiShoppingCart, FiUser, FiSettings, FiMessageSquare } from 'react-icons/fi';
import './BottomNav.css';

const BottomNav = () => {
  const { isAdmin } = useAuth();
  const { reservationItemCount, waitlistItemCount } = useCart();

  // 예약 상품과 대기 상품 수를 더하여 전체 아이템 수를 계산
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
      <NavLink to="/cart" className={getNavLinkClass}>
        <div className="cart-icon-wrapper">
          <FiShoppingCart />
          {cartItemCount > 0 && (
            <span className="cart-badge">{cartItemCount}</span>
          )}
        </div>
        <span>장바구니</span>
      </NavLink>
      {/* ✅ [수정] '고객센터' 메뉴의 경로를 /customer-center 로 수정합니다. */}
      <NavLink to="/customer-center" className={getNavLinkClass}>
        <FiMessageSquare />
        <span>고객센터</span>
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