// src/components/Header.tsx
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Bell, ShoppingCart, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import './Header.css';

// Notification 타입 정의
interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  timestamp: Date;
}

interface HeaderProps {
  title?: string;
  brandLogoUrl?: string;
  brandName?: string;
  storeName?: string;
  onBack?: () => void;
  currentUserName?: string;
  notifications?: Notification[];
  onMarkAsRead?: (notificationId: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  title,
  brandLogoUrl,
  brandName,
  storeName,
  onBack,
  currentUserName,
  notifications = [],
  onMarkAsRead,
}) => {
  const [currentDate, setCurrentDate] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const today = new Date();
    setCurrentDate(format(today, 'M/d(EEE)', { locale: ko }));
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // 수정: 날짜 클릭 핸들러를 /mypage/orders 경로로 이동
  const handleDateClick = () => {
    navigate('/mypage/orders');
  };

  return (
    <header className="main-header">
      {/* 좌측 영역: 날짜 */}
      <div className="header-left-spacer">
        {onBack && (
          <button onClick={onBack} className="header-back-button">
            <ChevronLeft size={24} color="#333" />
          </button>
        )}
        {/* 수정: 날짜 영역을 버튼으로 만들어 클릭 이벤트 추가 */}
        <button className="header-date-button" onClick={handleDateClick}>
          <span className="header-date-and-icon">
            <CalendarDays size={18} className="header-icon" />
            <span className="current-date">{currentDate}</span>
          </span>
        </button>
      </div>

      {/* 중앙 영역: 타이틀 또는 로고 텍스트 */}
      <div className="header-center">
        {title && (
          <span className="header-title-wrapper">
            {/* 제목에 맞는 아이콘 추가 (예시) */}
            {title === '장바구니' && <ShoppingCart size={24} className="header-title-icon" />}
            {title === '예약 내역' && <Bell size={24} className="header-title-icon" />}
            <h1 className="header-page-title">{title}</h1>
          </span>
        )}
        {/* 로고 대신 텍스트를 표시하는 조건 추가 */}
        {!title && brandName && storeName && (
          <div className="brand-text-logo-container">
              <span className="brand-name">{brandName}</span>
              <span className="store-name">{storeName}</span>
          </div>
        )}
        {/* brandLogoUrl이 있을 경우 이미지를 표시하는 기존 로직 유지 */}
        {!title && brandLogoUrl && !(brandName && storeName) && (
          <div className="brand-logo-container">
            <img src={brandLogoUrl} alt="Brand Logo" className="brand-logo" />
          </div>
        )}
      </div>

      {/* 우측 영역: 알림 & 환영 메시지 */}
      <div className="header-actions-spacer">
        {currentUserName && <span className="greeting-message">{currentUserName}님, 안녕하세요!</span>}
        {notifications && notifications.length > 0 && (
          <div className="notification-container">
            <button
              className="notification-button"
              onClick={() => setShowNotifications(prev => !prev)}
            >
              <Bell size={20} />
              {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
            </button>
            {showNotifications && (
              <div className="notification-dropdown">
                <h4>알림</h4>
                {notifications.length > 0 ? (
                  <ul>
                    {notifications.map(notification => (
                      <li
                        key={notification.id}
                        className={notification.isRead ? 'read' : 'unread'}
                        onClick={() => onMarkAsRead?.(notification.id)}
                      >
                        {notification.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>새로운 알림이 없습니다.</p>
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