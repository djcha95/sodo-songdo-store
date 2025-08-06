// src/components/common/Header.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, CalendarDays, Bell, Crown, Gem, Sparkles, ShieldAlert, ShieldX, TrendingUp, TrendingDown, Info, X, CheckCircle, XCircle, CalendarClock, Banknote, AlertCircle, BellRing } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import type { Notification, LoyaltyTier, NotificationType } from '@/types';
import './Header.css';


const getLoyaltyInfo = (tier?: LoyaltyTier): { tier: LoyaltyTier; icon: React.ReactNode; color: string } | null => {
    if (!tier) return null;
    switch(tier) {
        case '공구의 신': return { tier: '공구의 신', icon: <Crown size={16} />, color: 'var(--loyalty-god, #ffc107)' };
        case '공구왕': return { tier: '공구왕', icon: <Gem size={16} />, color: 'var(--loyalty-king, #4caf50)' };
        case '공구요정': return { tier: '공구요정', icon: <Sparkles size={16} />, color: 'var(--loyalty-fairy, #2196f3)' };
        case '공구새싹': return { tier: '공구새싹', icon: <i className="seedling-icon-header">🌱</i>, color: 'var(--loyalty-sprout, #8bc34a)' };
        case '주의 요망': return { tier: '주의 요망', icon: <ShieldAlert size={16} />, color: 'var(--loyalty-warning, #ff9800)' };
        case '참여 제한': return { tier: '참여 제한', icon: <ShieldX size={16} />, color: 'var(--loyalty-restricted, #f44336)' };
        default: return null;
    }
};

const notificationIcons: { [key in NotificationType | 'default']: React.ReactNode } = {
  POINTS_EARNED: <TrendingUp size={20} className="icon-success" />,
  POINTS_USED: <TrendingDown size={20} className="icon-info" />,
  WAITLIST_CONFIRMED: <CheckCircle size={20} className="icon-success" />,
  PAYMENT_CONFIRMED: <Banknote size={20} className="icon-success" />,
  PICKUP_REMINDER: <CalendarClock size={20} className="icon-warning" />,
  PICKUP_TODAY: <CalendarDays size={20} className="icon-warning" />,
  GENERAL_INFO: <Info size={20} className="icon-info" />,
  ORDER_PICKED_UP: <CheckCircle size={20} className="icon-success" />,
  NO_SHOW_WARNING: <AlertCircle size={20} className="icon-danger" />,
  PARTICIPATION_RESTRICTED: <ShieldX size={20} className="icon-danger" />,
  TIER_UP: <Crown size={20} className="icon-tier-up" />,
  TIER_DOWN: <ShieldAlert size={20} className="icon-tier-down" />,
  success: <CheckCircle size={20} className="icon-success" />,
  error: <XCircle size={20} className="icon-danger" />,
  default: <Info size={20} className="icon-info" />,
};

const getNotificationIcon = (type: NotificationType) => {
  return notificationIcons[type] || notificationIcons.default;
}

const NotificationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const { userDocument } = useAuth();
    // ✅ [수정] 오타를 수정하고, 새로 만든 markOneAsRead를 가져옵니다.
    const { notifications, unreadCount, markOneAsRead, markAllAsRead } = useNotifications();

    const loyaltyInfo = useMemo(() => {
        if (!userDocument) return null;
        return getLoyaltyInfo(userDocument.loyaltyTier);
    }, [userDocument]);

    const onNotificationClick = (notification: Notification) => {
        // ✅ [수정] 존재하지 않는 handleMarkAsRead 대신 markOneAsRead를 사용합니다.
        if (!notification.read) markOneAsRead(notification.id);
        if (notification.link) navigate(notification.link);
        onClose();
    };
    
    if(!isOpen) return null;

    return (
        <div className="notification-modal-overlay" onClick={onClose}>
            <div className="notification-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="notification-modal-header">
                    <h4>알림</h4>
                    <button onClick={onClose} className="modal-close-button"><X size={24}/></button>
                </div>
                <div className="notification-modal-body">
                    {unreadCount > 0 && (
                        <button onClick={markAllAsRead} className="mark-all-read-btn-mobile">
                            모두 읽음으로 표시
                        </button>
                    )}
                    <div className="notification-list">
                        {notifications.length > 0 ? (
                            notifications.map(n => (
                                <div key={n.id} className={`notification-item ${n.read ? 'read' : ''}`} onClick={() => onNotificationClick(n)}>
                                    <div className="notification-item-icon">{getNotificationIcon(n.type)}</div>
                                    <div className="notification-item-content">
                                        <p className="notification-message">{n.message}</p>
                                        <span className="notification-time">{n.timestamp && (n.timestamp as any).toDate ? formatDistanceToNow((n.timestamp as any).toDate(), { addSuffix: true, locale: ko }) : ''}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="notification-item no-notifications"><BellRing size={20}/><p>새로운 알림이 없습니다.</p></div>
                        )}
                    </div>
                </div>
                 {loyaltyInfo && userDocument && (
                    <div className="notification-modal-footer">
                        <div className="footer-points-section">
                            <span>내 신뢰도 포인트: <strong>{(userDocument.points || 0).toLocaleString()} P</strong></span>
                        </div>
                        <div className="footer-tier-section" style={{ '--tier-color': loyaltyInfo.color } as React.CSSProperties}>
                            {loyaltyInfo.icon}
                            <span>내 등급: <strong>{loyaltyInfo.tier}</strong></span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

interface HeaderConfig {
  title?: string;
  showBackButton?: boolean;
  showDate?: boolean;
  showLogo?: boolean;
}

const Header: React.FC<HeaderConfig> = (props) => {
  const [currentDate, setCurrentDate] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  const { user } = useAuth();
  // ✅ [수정] useNotification -> useNotifications 오타를 수정합니다.
  const { notifications, unreadCount } = useNotifications();

  const hasPickupToday = useMemo(() => 
    notifications.some(n => n.type === 'PICKUP_TODAY' && !n.read),
    [notifications]
  );

  useEffect(() => {
    setCurrentDate(format(new Date(), 'M/d(EEE)', { locale: ko }));
  }, []);

  useEffect(() => {
    if (isModalOpen) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = 'unset';
    }
    return () => {
        document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

  const config = useMemo((): HeaderConfig => {
    const { pathname } = location;
    
    if (Object.keys(props).length > 0) return props;

    const mainPages: Record<string, HeaderConfig> = {
        '/': { showLogo: true, showDate: true, showBackButton: false },
        '/cart': { title: '장바구니', showDate: true, showBackButton: false },
        '/mypage': { title: '마이페이지', showDate: true, showBackButton: false },
        '/onsite-sale': { title: '현장 판매', showDate: true, showBackButton: false },
        '/customer-center': { title: '고객센터', showDate: true, showBackButton: false },
    };

    if (mainPages[pathname]) {
        return mainPages[pathname];
    }
    
    const subPages: { [key: string]: string } = {
        '/mypage/history': '예약 내역',
        '/mypage/points': '포인트 내역',
        '/mypage/orders': '나의 픽업 캘린더',
        '/mypage/waitlist': '대기 신청',
        '/mypage/profile': '회원 정보',
    };

    for (const path in subPages) {
        if (pathname.startsWith(path)) {
            return { title: subPages[path], showBackButton: true, showDate: false };
        }
    }
    
    if (pathname.startsWith('/product/')) {
        return { title: '상품 상세', showBackButton: true, showDate: false };
    }

    return { title: '소도몰', showBackButton: true, showDate: false };
  }, [location.pathname, props]);

  return (
    <>
        <header className="main-header customer-header-sticky">
            <div className="header-left">
                {config.showBackButton && (
                  <button onClick={() => navigate(-1)} className="header-back-button" aria-label="뒤로 가기"><ChevronLeft size={24} /></button>
                )}
                {config.showDate && (
                  <button className="header-date-button" onClick={() => navigate('/mypage/history')}>
                      <CalendarDays size={18} />
                      <span>{currentDate}</span>
                  </button>
                )}
            </div>
            <div className="header-center">
                {config.title && <h1 className="header-page-title">{config.title}</h1>}
                {config.showLogo && (
                  <Link to="/" className="brand-text-logo-container">
                    <span className="brand-name">소도몰</span>
                    <span className="store-name">송도랜드마크점</span>
                  </Link>
                )}
            </div>
            <div className="header-right">
                {user && (
                    <button className="new-notification-button" onClick={() => setIsModalOpen(true)} aria-label={`알림 ${unreadCount}개`} data-tutorial-id="header-notifications">
                        <Bell size={22} />
                        {hasPickupToday && <span className="pickup-indicator">!</span>}
                        {unreadCount > 0 && !hasPickupToday && <span className="notification-badge">{unreadCount}</span>}
                    </button>
                )}
            </div>
        </header>
        <NotificationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};

export default Header;