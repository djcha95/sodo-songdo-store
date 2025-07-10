// src/components/Header.tsx

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import './Header.css';

// 헤더 설정을 위한 타입
interface HeaderConfig {
  title?: string;
  showBackButton: boolean;
  showDate: boolean;
  showLogo: boolean;
}

const Header: React.FC = () => {
  const [currentDate, setCurrentDate] = useState('');
  const navigate = useNavigate();
  const location = useLocation(); // 현재 경로를 가져옴
  const { user } = useAuth();

  // 오늘 날짜를 'M/d(EEE)' 형식으로 설정
  useEffect(() => {
    const today = new Date();
    setCurrentDate(format(today, 'M/d(EEE)', { locale: ko }));
  }, []);

  // 현재 경로(pathname)에 따라 헤더의 모습을 결정
  const getHeaderConfig = (pathname: string): HeaderConfig => {
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
      // 다른 마이페이지 하위 경로들도 여기에 추가할 수 있습니다.
      // 예: case '/mypage/orders': return { title: '픽업 달력', ... }
      default:
        // 기본값 (예: 상품 상세 페이지 등)
        return { showLogo: false, showDate: false, showBackButton: true };
    }
  };

  const config = getHeaderConfig(location.pathname);

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
      </div>
    </header>
  );
};

export default Header;
