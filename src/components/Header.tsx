// src/components/Header.tsx

import React, { useState, useEffect } from 'react';
import { ChevronLeft, Bell, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext'; // [추가]
import './Header.css';

// HeaderProps 인터페이스에서 currentUserName, brandName 등 제거
interface HeaderProps {
  title?: string;
  onBack?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, onBack }) => {
  const [currentDate, setCurrentDate] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth(); // [추가] 훅을 통해 직접 사용자 정보 가져오기

  useEffect(() => {
    const today = new Date();
    setCurrentDate(format(today, 'M/d(EEE)', { locale: ko }));
  }, []);

  const handleDateClick = () => navigate('/mypage/orders');

  return (
    <header className="main-header">
      <div className="header-left-spacer">
        {onBack ? (
          <button onClick={onBack} className="header-back-button">
            <ChevronLeft size={24} />
          </button>
        ) : (
          <button className="header-date-button" onClick={handleDateClick}>
            <CalendarDays size={18} className="header-icon" />
            <span className="current-date">{currentDate}</span>
          </button>
        )}
      </div>

      <div className="header-center">
        {title ? (
          <h1 className="header-page-title">{title}</h1>
        ) : (
          <div className="brand-text-logo-container">
              <span className="brand-name">소도몰</span>
              <span className="store-name">송도랜드마크점</span>
          </div>
        )}
      </div>

      <div className="header-actions-spacer">
        {user?.displayName && <span className="greeting-message">{user.displayName}님, 안녕하세요!</span>}
        <button className="notification-button">
          <Bell size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;