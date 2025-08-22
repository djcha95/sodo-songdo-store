// src/components/common/Header.tsx

import React from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { X, ShoppingBag, MessageSquare, User, LogOut, Settings, Bell, Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';
import './SideMenu.css';
import { useNotifications } from '@/context/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import SideMenu from './SideMenu';
import type { Notification, LoyaltyTier, NotificationType } from '@/types';
import './Header.css';

// (NotificationModal과 다른 헬퍼 함수들은 여기에 위치합니다 - 생략)

const getLoyaltyInfo = (tier?: LoyaltyTier): { tier: LoyaltyTier; icon: React.ReactNode; color: string } | null => {
    return null;
};

const notificationIcons: { [key in NotificationType | 'default']: React.ReactNode } = {
    POINTS_EARNED: <Bell size={20} />,
    POINTS_USED: <Bell size={20} />,
    WAITLIST_CONFIRMED: <Bell size={20} />,
    PAYMENT_CONFIRMED: <Bell size={20} />,
    PICKUP_REMINDER: <Bell size={20} />,
    PICKUP_TODAY: <Bell size={20} />,
    GENERAL_INFO: <Bell size={20} />,
    ORDER_PICKED_UP: <Bell size={20} />,
    NO_SHOW_WARNING: <Bell size={20} />,
    PARTICIPATION_RESTRICTED: <Bell size={20} />,
    TIER_UP: <Bell size={20} />,
    TIER_DOWN: <Bell size={20} />,
    PRODUCT_UPDATE: <Bell size={20} />,
    ENCORE_AVAILABLE: <Bell size={20} />,
    success: <Bell size={20} />,
    error: <Bell size={20} />,
    default: <Bell size={20} />,
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
    const { notifications, unreadCount, markOneAsRead, markAllAsRead } = useNotifications();

    const loyaltyInfo = React.useMemo(() => {
        if (!userDocument) return null;
        return getLoyaltyInfo(userDocument.loyaltyTier);
    }, [userDocument]);

    const onNotificationClick = (notification: Notification) => {
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
                    <p>알림 내용이 여기에 표시됩니다.</p>
                </div>
            </div>
        </div>
    )
}

// --- 메인 헤더 컴포넌트 ---
const Header: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false); 

  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  
  React.useEffect(() => {
    if (isModalOpen || isMenuOpen) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = 'unset';
    }
    return () => {
        document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, isMenuOpen]);


  return (
    <>
        <header className="main-header customer-header-sticky">
            <div className="header-left">
                <button 
                    onClick={() => setIsMenuOpen(true)} 
                    className="header-action-btn" 
                    aria-label="메뉴 열기"
                >
                    <Menu size={24} />
                </button>
            </div>
            <div className="header-center">
                {/* ✅ [확인] 이 링크를 누르면 '/' 경로로 이동하여 '오늘의 공구' 페이지가 열립니다. */}
                <Link to="/" className="brand-text-logo-container">
                    <span className="brand-name">소도몰</span>
                    <span className="store-name">송도랜드마크점</span>
                </Link>
            </div>
            <div className="header-right">
                {user && (
                    <button 
                        className="header-action-btn" 
                        onClick={() => setIsModalOpen(true)} 
                        aria-label={`알림 ${unreadCount}개`}
                    >
                        <Bell size={24} />
                        {unreadCount > 0 && <span className="notification-badge-header">{unreadCount}</span>}
                    </button>
                )}
            </div>
        </header>
        
        <NotificationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        
        <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </>
  );
};

export default Header;