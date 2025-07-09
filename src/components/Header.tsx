// src/components/Header.tsx

import React, { useState, useEffect } from 'react';
import { ChevronLeft, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import './Header.css';

interface HeaderProps {
  title?: string;
  onBack?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, onBack }) => {
  const [currentDate, setCurrentDate] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const today = new Date();
    setCurrentDate(format(today, 'M/d(EEE)', { locale: ko }));
  }, []);

  const handleDateClick = () => navigate('/mypage/orders');

  return (
    // ✅ CSS와 연동을 위해 className 추가
    <header className="main-header customer-header-sticky">
      <div className="header-left">
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

      <div className="header-right">
        {/* ✅ 인사말 UI 변경 */}
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