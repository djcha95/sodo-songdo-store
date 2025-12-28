// src/components/admin/DangerButton.tsx

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import './DangerButton.css';

interface DangerButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  confirmText?: string;
  variant?: 'danger' | 'warning';
  className?: string;
  disabled?: boolean;
}

const DangerButton: React.FC<DangerButtonProps> = ({
  onClick,
  children,
  confirmText = '다시 클릭하여 확인',
  variant = 'danger',
  className = '',
  disabled = false,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    if (!isConfirming) {
      setIsConfirming(true);
      // 3초 후 자동 취소
      setTimeout(() => setIsConfirming(false), 3000);
      return;
    }
    onClick();
    setIsConfirming(false);
  };

  return (
    <button
      className={`danger-button ${variant} ${isConfirming ? 'confirming' : ''} ${className}`}
      onClick={handleClick}
      type="button"
      disabled={disabled}
    >
      {isConfirming ? (
        <>
          <AlertTriangle size={16} />
          <span>{confirmText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default DangerButton;

