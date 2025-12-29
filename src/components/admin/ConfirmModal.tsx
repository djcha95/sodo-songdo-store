// src/components/admin/ConfirmModal.tsx

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import "./ConfirmModal.css";

type ConfirmVariant = "danger" | "warning" | "default";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  /**
   * 2단계 확인: 체크박스 + 확인 문구 입력
   */
  checkboxLabel?: string;
  requirePhrase?: string; // 예: "실행", "재구축", "생성"
  phraseHint?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  checkboxLabel = "위 내용을 이해했고, 실행 결과에 책임을 집니다.",
  requirePhrase,
  phraseHint,
  confirmLabel = "확인",
  cancelLabel = "취소",
  variant = "danger",
  isLoading = false,
  onClose,
  onConfirm,
}) => {
  const [checked, setChecked] = useState(false);
  const [phrase, setPhrase] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setChecked(false);
    setPhrase("");
  }, [isOpen]);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const phraseNormalized = phrase.trim();
  const canConfirm = useMemo(() => {
    if (isLoading) return false;
    if (!checked) return false;
    if (requirePhrase && phraseNormalized !== requirePhrase) return false;
    return true;
  }, [checked, requirePhrase, phraseNormalized, isLoading]);

  if (!isOpen) return null;

  return (
    <div className="confirm-modal-overlay" role="dialog" aria-modal="true">
      <div className={`confirm-modal ${variant}`}>
        <div className="confirm-modal-header">
          <div className="confirm-modal-title">
            {(variant === "danger" || variant === "warning") && (
              <span className="confirm-modal-icon">
                <AlertTriangle size={20} />
              </span>
            )}
            <h3>{title}</h3>
          </div>
          <button className="confirm-modal-close" onClick={onClose} aria-label="닫기" disabled={isLoading}>
            <X size={18} />
          </button>
        </div>

        {description && <div className="confirm-modal-body">{description}</div>}

        <div className="confirm-modal-guard">
          <label className="confirm-modal-checkbox">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={isLoading}
            />
            <span>{checkboxLabel}</span>
          </label>

          {requirePhrase && (
            <div className="confirm-modal-phrase">
              <div className="confirm-modal-phrase-hint">
                {phraseHint ?? `확인 문구로 “${requirePhrase}”을(를) 입력해야 진행됩니다.`}
              </div>
              <input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={requirePhrase}
                disabled={isLoading}
              />
            </div>
          )}
        </div>

        <div className="confirm-modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </button>
          <button
            className="btn-confirm"
            onClick={() => onConfirm()}
            disabled={!canConfirm}
          >
            {isLoading ? "처리 중..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;


