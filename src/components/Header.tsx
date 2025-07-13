// src/components/Header.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, CalendarDays, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import './Header.css';
// ✅ [수정] 사용하지 않는 NotificationType 임포트 제거
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
  
  const isHomePage = location.pathname === '/';

  const { user, notifications = [], handleMarkAsRead = () => {} } = useAuth();

  const hasPickupToday = notifications.some(n => n.type === 'PICKUP_TODAY' && !n.isRead);
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
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;