// src/components/common/SideMenu.tsx

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
// ✅ [수정] 'Package' 아이콘을 추가로 import 합니다.
import { X, ShoppingBag, MessageSquare, User, LogOut, Settings, Package } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import './SideMenu.css';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const SideMenu: React.FC<SideMenuProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user, userDocument, isAdmin, logout } = useAuth();
  const loyaltyTier = userDocument?.loyaltyTier || '등급 정보 없음';

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('로그아웃 되었습니다.');
      navigate('/login');
    } catch (error) {
      toast.error('로그아웃 중 오류가 발생했습니다.');
    } finally {
      onClose();
    }
  };

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    return "sidemenu-link" + (isActive ? " active" : "");
  };

  return (
    <>
      <div 
        className={`sidemenu-overlay ${isOpen ? 'open' : ''}`} 
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <nav className={`sidemenu-panel ${isOpen ? 'open' : ''}`}>
        <div className="sidemenu-header">
          {user ? (
            <div className="user-profile-section">
              <div className="user-avatar">{user.displayName?.charAt(0)}</div>
              <div className="user-info">
                <span className="user-name">{user.displayName}님</span>
                <span className="user-tier">{loyaltyTier}</span>
              </div>
            </div>
          ) : (
            <h2>메뉴</h2>
          )}
          <button onClick={onClose} className="sidemenu-close-btn" aria-label="메뉴 닫기">
            <X size={24} />
          </button>
        </div>

        <div className="sidemenu-links">
          {/* ✅ [추가] SimpleOrderPage로 이동하는 '오늘의 공구' 링크를 추가합니다. */}
          <NavLink to="/" className={getNavLinkClass} onClick={onClose} end>
            <Package size={20} />
            <span>오늘의 공구</span>
          </NavLink>
          <NavLink to="/onsite-sale" className={getNavLinkClass} onClick={onClose}>
            <ShoppingBag size={20} />
            <span>현장 판매</span>
          </NavLink>
          <NavLink to="/customer-center" className={getNavLinkClass} onClick={onClose}>
            <MessageSquare size={20} />
            <span>고객센터</span>
          </NavLink>
          <NavLink to="/mypage" className={getNavLinkClass} onClick={onClose}>
            <User size={20} />
            <span>마이페이지</span>
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={getNavLinkClass} onClick={onClose}>
              <Settings size={20} />
              <span>관리자 페이지</span>
            </NavLink>
          )}
        </div>

        {user && (
          <div className="sidemenu-footer">
            <button className="logout-button" onClick={handleLogout}>
              <LogOut size={20} />
              <span>로그아웃</span>
            </button>
          </div>
        )}
      </nav>
    </>
  );
};

export default SideMenu;