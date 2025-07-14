// src/components/BottomNav.tsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
// ❗ [수정] 고객센터 아이콘 추가
import { FiHome, FiShoppingBag, FiShoppingCart, FiUser, FiSettings, FiMessageSquare } from 'react-icons/fi';
import './BottomNav.css';

const BottomNav = () => {
  const { isAdmin } = useAuth();
  // [수정] useCart에서 reservationItemCount와 waitlistItemCount를 가져옵니다.
  const { reservationItemCount, waitlistItemCount } = useCart();

  // [수정] 두 값을 더하여 장바구니에 표시할 전체 아이템 수를 계산합니다.
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
      {/* ❗ [추가] '고객센터' 메뉴를 추가하고 /store-info 경로로 연결합니다. */}
      <NavLink to="/store-info" className={getNavLinkClass}>
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