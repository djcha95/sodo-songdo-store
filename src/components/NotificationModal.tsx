// src/components/NotificationModal.tsx

import React, { useEffect, useRef } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import '@/components/NotificationModal.css';

interface NotificationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

const NotificationModal: React.FC<NotificationModalProps> = ({ isOpen, title, message, type = 'info', onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const icon = type === 'success' ? <CheckCircle size={48} /> : type === 'error' ? <XCircle size={48} /> : null;
  const iconColorClass = `icon-${type}`;

  return (
    <div className="notification-modal-overlay">
      <div className="notification-modal-content" ref={modalRef}>
        {icon && (
          <div className={`modal-icon ${iconColorClass}`}>
            {icon}
          </div>
        )}
        <h2 className="modal-title">{title}</h2>
        <p className="modal-message">{message}</p>
        <button className="modal-close-button" onClick={onClose}>확인</button>
      </div>
    </div>
  );
};

export default NotificationModal;