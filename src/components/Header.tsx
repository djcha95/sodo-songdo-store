// src/components/Header.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom'; // ✅ Link 추가
import { ChevronLeft, CalendarDays, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import './Header.css';
import type { Notification } from '@/types';

interface HeaderProps {
  title?: string;
  showBackButton?: boolean;
  showDate?: boolean;
  showLogo?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  title,
  showBackButton,
  showDate,
  showLogo,
}) => {
  const [currentDate, setCurrentDate] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { user, notifications = [], handleMarkAsRead = () => {} } = useAuth();
  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    const today = new Date();
    setCurrentDate(format(today, 'M/d(EEE)', { locale: ko }));

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const getInternalHeaderConfig = (pathname: string): HeaderProps => {
    switch (pathname) {
      case '/':
        return { showLogo: true, showDate: true, showBackButton: false };
      case '/cart':
        return { title: '장바구니', showBackButton: true, showDate: false, showLogo: false };
      case '/mypage':
        return { title: '마이페이지', showBackButton: false, showDate: false, showLogo: false };
      case '/mypage/history':
        return { title: '예약 내역', showBackButton: true, showDate: false, showLogo: false };
      // ❗ [수정] /store-info 경로에 대한 헤더 설정 추가
      case '/store-info':
        return { title: '고객센터', showBackButton: false, showDate: false, showLogo: false };
      default:
        if (pathname.startsWith('/product/')) {
            return { title: '상품 상세', showBackButton: true };
        }
        return { showLogo: false, showDate: false, showBackButton: true };
    }
  };
  
  const getCombinedConfig = (): HeaderProps => {
    const internalConfig = getInternalHeaderConfig(location.pathname);
    return {
      title: title !== undefined ? title : internalConfig.title,
      showBackButton: showBackButton !== undefined ? showBackButton : internalConfig.showBackButton,
      showDate: showDate !== undefined ? showDate : internalConfig.showDate,
      showLogo: showLogo !== undefined ? showLogo : internalConfig.showLogo,
    };
  };

  const config = getCombinedConfig();

  const onNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
    setIsDropdownOpen(false);
  };

  return (
    <header className="main-header customer-header-sticky">
      <div className="header-left">
        {config.showBackButton && (
          <button onClick={() => navigate(-1)} className="header-back-button" aria-label="뒤로 가기">
            <ChevronLeft size={24} />
          </button>
        )}
        {config.showDate && (
          <button className="header-date-button" onClick={() => navigate('/mypage/history')}>
            <CalendarDays size={18} className="header-icon" />
            <span className="current-date">{currentDate}</span>
          </button>
        )}
      </div>

      <div className="header-center">
        {config.title && <h1 className="header-page-title">{config.title}</h1>}
        {config.showLogo && (
          // ❗ [수정] 로고 클릭 시 홈으로 이동하도록 Link 컴포넌트로 감쌉니다.
          <Link to="/" className="brand-text-logo-container">
            <span className="brand-name">소도몰</span>
            <span className="store-name">송도랜드마크점</span>
          </Link>
        )}
      </div>

      <div className="header-right">
        {user?.displayName && (
          // ❗ [수정] 사용자 이름 클릭 시 마이페이지로 이동하도록 Link 컴포넌트로 감쌉니다.
          <Link to="/mypage" className="greeting-message">
            <span>{user.displayName}님</span>
            <span className="greeting-subtext">안녕하세요!</span>
          </Link>
        )}
        
        <div className="notification-container" ref={dropdownRef}>
          <button 
            className="notification-button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-label={`알림 ${unreadCount}개`}
          >
            <Bell size={22} />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </button>
          
          {isDropdownOpen && (
            <div className="notification-dropdown">
              {notifications.length > 0 ? (
                notifications.map(n => (
                  <div 
                    key={n.id} 
                    className={`notification-item ${n.isRead ? 'read' : ''}`}
                    onClick={() => onNotificationClick(n)}
                  >
                    {n.message}
                  </div>
                ))
              ) : (
                <div className="notification-item no-notifications">
                  알림이 없습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;