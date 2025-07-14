// src/components/common/Header.tsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, CalendarDays, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import { useNotification } from '@/context/NotificationContext'; // ✅ useNotification import
import type { Notification } from '@/types';
import './Header.css';

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
  
  const isHomePage = location.pathname === '/';

  const { user } = useAuth();
  // ✅ [수정] useAuth 대신 useNotification 훅에서 알림 관련 데이터와 함수를 가져옵니다.
  const { notifications, unreadCount, handleMarkAsRead, markAllAsRead } = useNotification();

  // 픽업 당일 알림이 있는지 여부는 notifications 배열로 직접 계산합니다.
  const hasPickupToday = useMemo(() => 
    notifications.some(n => n.type === 'PICKUP_TODAY' && !n.isRead),
    [notifications]
  );

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
    // ... 이 함수 내용은 변경 없습니다 ...
    switch (pathname) {
      case '/':
        return { showLogo: true, showDate: true, showBackButton: false };
      case '/cart':
        return { title: '장바구니', showBackButton: true, showDate: false, showLogo: false };
      case '/mypage':
        return { title: '마이페이지', showBackButton: false, showDate: false, showLogo: false };
      case '/mypage/history':
        return { title: '예약 내역', showBackButton: true, showDate: false, showLogo: false };
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

  const handleMarkAllReadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllAsRead();
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
        {config.showLogo &&
          (isHomePage ? (
            <div className="brand-text-logo-container">
              <span className="brand-name">소도몰</span>
              <span className="store-name">송도랜드마크점</span>
            </div>
          ) : (
            <Link to="/" className="brand-text-logo-container">
              <span className="brand-name">소도몰</span>
              <span className="store-name">송도랜드마크점</span>
            </Link>
          ))}
      </div>

      <div className="header-right">
        {user && (
          <div className="notification-container" ref={dropdownRef}>
            <button 
              className="new-notification-button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-label={`알림 ${unreadCount}개`}
            >
              <Bell size={22} />
              <span>알림</span>
              {hasPickupToday && <span className="pickup-indicator">!</span>}
              {unreadCount > 0 && !hasPickupToday && (
                <span className="notification-badge">{unreadCount}</span>
              )}
            </button>
            
            {isDropdownOpen && (
              <div className="notification-dropdown">
                <div className="notification-dropdown-header">
                  <h4>알림</h4>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllReadClick} className="mark-all-read-btn">
                      모두 읽음
                    </button>
                  )}
                </div>
                <div className="notification-list">
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
                      새로운 알림이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;