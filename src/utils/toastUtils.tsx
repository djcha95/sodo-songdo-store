// src/utils/toastUtils.tsx

import toast from 'react-hot-toast';
import type { Toast } from 'react-hot-toast';
import React from 'react';
import { AlertCircle, Info, Zap } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'loading';

// 기본 스타일 옵션 (유지)
const customToastOptions = {
  duration: Infinity, 
  style: {
    background: 'transparent',
    boxShadow: 'none',
    padding: 0,
    border: 'none',
  },
};

/**
 * @description 일반 정보성 토스트를 표시합니다. (2초 후 자동 닫힘)
 * @param type 토스트 타입 (success, error, info, loading)
 * @param message 표시할 메시지
 * @param duration 표시 시간 (기본값: 2000ms)
 */
export const showToast = (type: ToastType, message: string, duration: number = 2000) => {
  let toastId: string;

  switch (type) {
    case 'success':
      toastId = toast.success(message, { duration });
      break;
    case 'error':
      toastId = toast.error(message, { duration });
      break;
    case 'info':
      toastId = toast(message, { duration, icon: 'ℹ️' });
      break;
    case 'loading':
      toastId = toast.loading(message);
      break;
    default:
      toastId = toast(message, { duration });
      break;
  }

  // ✅ [수정] 모바일 '호버(터치) 시 멈춤' 현상 방지: 강제 종료 타이머 추가
  // loading 타입이나 무한 지속이 아닌 경우에만 적용
  if (type !== 'loading' && duration !== Infinity) {
    setTimeout(() => {
      toast.dismiss(toastId);
    }, duration + 500); // 애니메이션 고려하여 duration보다 0.5초 뒤에 확실히 닫음
  }
};

/**
 * @description Promise 기반의 토스트를 표시합니다.
 */
export const showPromiseToast = <T, E = Error>(
  promise: Promise<T>,
  handlers: {
    loading: string;
    success: (data: T) => string;
    error: (err: E) => string;
  }
) => {
  const toastId = toast.loading(handlers.loading);

  promise
    .then((data) => {
      const message = handlers.success(data);
      toast.success(message, {
        id: toastId,
        duration: 2000,
      });
      
      // ✅ [수정] 성공 시에도 강제 종료 타이머 가동
      setTimeout(() => toast.dismiss(toastId), 2500);
    })
    .catch((err) => {
      const message = handlers.error(err);
      toast.error(message, {
        id: toastId,
        duration: 2000,
      });
      
      // ✅ [수정] 실패 시에도 강제 종료 타이머 가동
      setTimeout(() => toast.dismiss(toastId), 2500);
    });

  return promise;
};

// ... (아래 showConfirmationToast 등 나머지 코드는 기존과 동일하게 유지) ...
interface ConfirmationToastProps {
  t: Toast;
  icon?: React.ReactNode;
  title: string;
  message: string | React.ReactNode;
  warning?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  onConfirm: () => void;
  confirmButtonClass?: 'button-danger' | 'button-accent';
}

export const showConfirmationToast = ({
  t,
  icon = <AlertCircle style={{ color: 'var(--warning-color)' }} />,
  title,
  message,
  warning,
  confirmButtonText = '확인',
  cancelButtonText = '취소',
  onConfirm,
  confirmButtonClass = 'button-danger',
}: ConfirmationToastProps) => {
  return (
    <div className="confirmation-toast">
      <h4>{icon} {title}</h4>
      <p>{message}</p>
      {warning && (
        <div className="toast-warning-box">
          <Info size={16} /> {warning}
        </div>
      )}
      <div className="toast-buttons">
        <button
          className="common-button button-secondary button-medium"
          onClick={() => toast.dismiss(t.id)}
        >
          {cancelButtonText}
        </button>
        <button
          className={`common-button ${confirmButtonClass} button-medium`}
          onClick={() => {
            toast.dismiss(t.id);
            onConfirm();
          }}
        >
          {confirmButtonText}
        </button>
      </div>
    </div>
  );
};

export const showCancelOrderToast = (onConfirm: () => void) => {
  toast((t) => showConfirmationToast({
    t,
    title: '예약 취소',
    message: '예약을 취소하시겠습니까?',
    warning: '1차 마감 이후 취소 시 신뢰도 포인트가 차감될 수 있습니다.',
    confirmButtonText: '취소 확정',
    cancelButtonText: '유지',
    onConfirm,
  }), customToastOptions);
};