// src/pages/admin/components/Notification.tsx

import React, { useEffect } from 'react';
import './Notification.css';
import { CheckCircle, XCircle, Info } from 'lucide-react';

interface NotificationProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const icons = {
  success: <CheckCircle size={20} />,
  error: <XCircle size={20} />,
  info: <Info size={20} />,
};

const Notification: React.FC<NotificationProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000); // 3초 후에 자동으로 닫힘

    return () => clearTimeout(timer);
  }, [onClose]);

  if (!message) return null;

  return (
    <div className={`notification toast ${type}`} onClick={onClose}>
      <div className="toast-icon">{icons[type]}</div>
      <p>{message}</p>
    </div>
  );
};

export default Notification;