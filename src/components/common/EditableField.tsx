// src/components/common/EditableField.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Edit } from 'lucide-react';

export interface EditableFieldProps {
  value: string;
  onSave: (newValue: string) => void;
  isAdmin: boolean;
  as?: 'input' | 'textarea';
  className?: string;
  placeholder?: string;
}

export const EditableField: React.FC<EditableFieldProps> = ({ 
  value, 
  onSave, 
  isAdmin, 
  as = 'input', 
  className = '',
  placeholder = '(내용 없음)'
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);
  
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      // textarea의 경우, 커서를 맨 뒤로 이동
      if (as === 'textarea' && inputRef.current) {
        const el = inputRef.current as HTMLTextAreaElement;
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    }
  }, [isEditing, as]);

  const handleSave = () => {
    if (currentValue !== value) {
      onSave(currentValue);
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // textarea에서는 Shift+Enter로 줄바꿈을 허용하고, Enter만 눌렀을 때 저장
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };
  
  if (!isAdmin) {
    // 관리자가 아닐 때, 값이 없으면 빈 문자열을, 있으면 값을 표시
    return <span className={className}>{value || ''}</span>;
  }
  
  if (isEditing) {
    const commonProps = {
      ref: inputRef as any,
      value: currentValue,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCurrentValue(e.target.value),
      onBlur: handleSave,
      onKeyDown: handleKeyDown,
      className: "inline-edit-input"
    };
    return as === 'textarea' 
      ? <textarea {...commonProps} rows={4} /> 
      : <input {...commonProps} />;
  }
  
  return (
    <span className={`${className} editable`} onClick={() => setIsEditing(true)}>
      {value || <span className="placeholder-text">{placeholder}</span>}
      <Edit size={12} className="edit-pencil-icon"/>
    </span>
  );
};