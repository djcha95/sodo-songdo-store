// src/components/common/SideMenu.tsx

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { X, ShoppingBag, MessageSquare, User, LogOut, Settings, Package, ListOrdered, Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import toast from 'react-hot-toast';
import './SideMenu.css';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNotifications: () => void;
}

const SideMenu: React.FC<SideMenuProps> = ({ isOpen, onClose, onOpenNotifications }) => {
  const navigate = useNavigate();
  const { user, userDocument, isAdmin, logout } = useAuth();
  const { unreadCount } = useNotifications();
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

  const handleNotificationClick = () => {
    onClose();
    onOpenNotifications();
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
          <NavLink to="/" className={getNavLinkClass} onClick={onClose} end>
            <Package size={20} />
            <span>오늘의 공구</span>
          </NavLink>
          <NavLink to="/mypage/history" className={getNavLinkClass} onClick={onClose}>
            <ListOrdered size={20} />
            <span>예약내역 확인하기</span>
          </NavLink>
          
          {/* ✅ [추가] 알림 버튼을 사이드 메뉴에 추가합니다. */}
          {user && (
            <button className="sidemenu-link" onClick={handleNotificationClick}>
              <Bell size={20} />
              <span>알림</span>
              {unreadCount > 0 && (
                <span className="sidemenu-notification-badge">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

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