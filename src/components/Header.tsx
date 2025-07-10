// src/components/Header.tsx

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, CalendarDays /* , Bell */ } from 'lucide-react'; // Bell 아이콘은 필요시 주석 해제
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import './Header.css';

// ✅ [수정] Notification 타입을 src/types.ts에서 가져옵니다.
import type { Notification } from '@/types';

// Header 컴포넌트의 props를 정의
interface HeaderProps {
  title?: string; // 페이지 제목 (선택적)
  showBackButton?: boolean; // 뒤로가기 버튼 표시 여부 (선택적)
  showDate?: boolean; // 날짜 표시 여부 (선택적)
  showLogo?: boolean; // 로고 표시 여부 (선택적)
  notifications?: Notification[]; // 알림 배열 (선택적, 기본값 [])
  onMarkAsRead?: (id: string) => void; // 알림 읽음 처리 함수 (선택적, 기본값 no-op 함수)
}

const Header: React.FC<HeaderProps> = ({
  title,
  showBackButton,
  showDate,
  showLogo,
  notifications = [], // 기본값 설정
  onMarkAsRead = () => {}, // 기본값 설정
}) => {
  const [currentDate, setCurrentDate] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const today = new Date();
    setCurrentDate(format(today, 'M/d(EEE)', { locale: ko }));
  }, []);

  // 현재 경로(pathname)에 따라 내부적인 기본 헤더 설정을 결정
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
      case '/mypage/store-info':
        return { title: '매장 정보', showBackButton: true, showDate: false, showLogo: false };
      default:
        return { showLogo: false, showDate: false, showBackButton: true };
    }
  };

  // 외부 props와 내부 설정을 조합하여 최종 config를 결정
  // 외부 props가 정의되어 있다면 내부 설정을 덮어씁니다.
  const getCombinedConfig = (): HeaderProps => {
    const internalConfig = getInternalHeaderConfig(location.pathname);

    return {
      title: title !== undefined ? title : internalConfig.title,
      showBackButton: showBackButton !== undefined ? showBackButton : internalConfig.showBackButton,
      showDate: showDate !== undefined ? showDate : internalConfig.showDate,
      showLogo: showLogo !== undefined ? showLogo : internalConfig.showLogo,
      notifications, // notifications는 항상 props로 전달된 것을 사용 (기본값 [] 포함)
      onMarkAsRead, // onMarkAsRead는 항상 props로 전달된 것을 사용 (기본값 no-op 함수 포함)
    };
  };

  const config = getCombinedConfig();

  return (
    <header className="main-header customer-header-sticky">
      <div className="header-left">
        {config.showBackButton && (
          <button onClick={() => navigate(-1)} className="header-back-button">
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
          <div className="brand-text-logo-container" onClick={() => navigate('/')}>
            <span className="brand-name">소도몰</span>
            <span className="store-name">송도랜드마크점</span>
          </div>
        )}
      </div>

      <div className="header-right">
        {user?.displayName && (
          <div className="greeting-message">
            <span>{user.displayName}님</span>
            <span className="greeting-subtext">안녕하세요!</span>
          </div>
        )}
        {/* 알림 아이콘 및 미확인 알림 개수 표시 (주석 처리됨 - 필요시 주석 해제하고 Bell 아이콘 import) */}
        {/* {notifications.length > 0 && (
          <button className="notification-icon-button" onClick={() => { /* 알림 페이지로 이동 또는 모달 열기 * /}}>
            <Bell size={20} />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="notification-badge">
                {notifications.filter(n => !n.read).length}
              </span>
            )}
          </button>
        )} */}
      </div>
    </header>
  );
};

export default Header;