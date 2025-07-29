// src/utils/toastUtils.tsx
import toast from 'react-hot-toast';
import type { Toast } from 'react-hot-toast';
import React from 'react';
import { AlertCircle, Info, Zap } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'loading';

/**
 * @description 일반 정보성 토스트를 표시합니다. (3초 후 자동 닫힘)
 * @param type 토스트 타입 (success, error, info, loading)
 * @param message 표시할 메시지
 * @param duration 표시 시간 (기본값: 3000ms)
 */
export const showToast = (type: ToastType, message: string, duration: number = 3000) => {
  switch (type) {
    case 'success':
      toast.success(message, { duration });
      break;
    case 'error':
      toast.error(message, { duration });
      break;
    case 'info':
      toast(message, { duration, icon: 'ℹ️' });
      break;
    case 'loading':
      toast.loading(message);
      break;
    default:
      toast(message, { duration });
      break;
  }
};

/**
 * @description Promise 기반의 토스트를 표시합니다.
 * @param promise 처리할 Promise 객체
 * @param messages 상태별 메시지 (loading, success, error)
 */
export const showPromiseToast = (
  promise: Promise<any>,
  messages: { loading: string; success: string | ((data: any) => string); error: string | ((err: any) => string) }
) => {
  return toast.promise(promise, messages, {
      success: {
          duration: 3000,
      },
      error: {
          duration: 4000,
      }
  });
};


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

/**
 * @description 확인/취소 버튼이 포함된 커스텀 토스트를 표시합니다.
 */
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

// OrderHistoryPage에서 사용되던 특정 토스트들을 유틸리티 함수로 분리
export const showCancelOrderToast = (onConfirm: () => void) => {
  toast((t) => showConfirmationToast({
    t,
    title: '예약 취소',
    message: '예약을 취소하시겠습니까?',
    warning: '1차 마감 이후 취소 시 신뢰도 포인트가 차감될 수 있습니다.',
    confirmButtonText: '취소 확정',
    cancelButtonText: '유지',
    onConfirm,
  }));
};

export const showCancelWaitlistToast = (itemName: string, quantity: number, onConfirm: () => void) => {
  toast((t) => showConfirmationToast({
    t,
    icon: <AlertCircle />,
    title: '대기 취소',
    message: (
      <>
        <strong>{itemName}</strong> ({quantity}개) 대기 신청을 취소하시겠습니까?
      </>
    ),
    confirmButtonText: '취소 확정',
    cancelButtonText: '유지',
    onConfirm,
  }));
};

export const showUseTicketToast = (onConfirm: () => void) => {
  toast((t) => showConfirmationToast({
    t,
    icon: <Zap size={20} />,
    title: '순번 상승권 사용',
    message: '50 포인트를 사용하여 이 상품의 대기 순번을 가장 앞으로 옮기시겠습니까?',
    confirmButtonText: '포인트 사용',
    cancelButtonText: '취소',
    onConfirm,
    confirmButtonClass: 'button-accent',
  }));
}