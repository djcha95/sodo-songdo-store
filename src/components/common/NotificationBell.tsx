// src/components/NotificationBell.tsx
import { useState } from 'react';
// Notification 타입은 중앙 관리 파일인 types.ts에서 가져옵니다.
import type { Notification } from '../../types';
import '../App.css'; // src/components/ 에서 src/App.css 로 접근

interface NotificationBellProps {
  notifications?: Notification[]; // props에 선택적 속성을 표시합니다.
  onMarkAsRead: (id: string) => void;
}

// [개선] notifications props에 기본값([])을 설정하여 undefined 오류를 방지합니다.
const NotificationBell = ({ notifications = [], onMarkAsRead }: NotificationBellProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };
  
  const handleRead = (id: string) => {
    onMarkAsRead(id);
  };

  return (
    <div className="notification-bell">
      <button onClick={handleToggle} className="notification-button">
        🔔
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>알림</h3>
          </div>
          <ul className="notification-list">
            {notifications.length > 0 ? (
              notifications.map(noti => (
                <li key={noti.id} className={noti.isRead ? 'read' : 'unread'} onClick={() => handleRead(noti.id)}>
                  <p className="notification-message">{noti.message}</p>
                  <span className="notification-time">
                    {/* [수정] .toDate()를 호출하여 Timestamp를 Date 객체로 변환합니다. */}
                    {noti.timestamp?.toDate().toLocaleDateString('ko-KR') || '날짜 없음'}
                  </span>
                </li>
              ))
            ) : (
              <li className="no-notifications">새로운 알림이 없습니다.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;