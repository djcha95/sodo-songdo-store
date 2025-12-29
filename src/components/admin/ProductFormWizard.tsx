// src/components/admin/ProductFormWizard.tsx - 단계별 가이드 컴포넌트

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Check, Circle } from 'lucide-react';
import './ProductFormWizard.css';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface ProductFormWizardProps {
  steps: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
  progress: number;
  variant?: 'default' | 'compact';
}

const ProductFormWizard: React.FC<ProductFormWizardProps> = ({
  steps,
  currentStep,
  onStepChange,
  onNext,
  onPrevious,
  canGoNext,
  canGoPrevious,
  progress,
  variant = 'default',
}) => {
  if (variant === 'compact') {
    return (
      <div className="wizard-container wizard-compact">
        <div className="wizard-steps-compact">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            const isClickable = isCompleted || index === currentStep;

            return (
              <div
                key={step.id}
                className={`wizard-step-compact ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isClickable ? 'clickable' : ''}`}
                onClick={() => isClickable && onStepChange(index)}
                title={`${step.title}: ${step.description}`}
              >
                <div className="wizard-step-icon-compact">
                  {isCompleted ? (
                    <Check size={10} />
                  ) : (
                    <Circle size={10} />
                  )}
                </div>
                <div className="wizard-step-title-compact">{step.title}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-container">
      {/* 진행률 바 */}
      <div className="wizard-progress-bar">
        <div 
          className="wizard-progress-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 단계 표시 */}
      <div className="wizard-steps">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          const isClickable = isCompleted || index === currentStep;

          return (
            <div
              key={step.id}
              className={`wizard-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isClickable ? 'clickable' : ''}`}
              onClick={() => isClickable && onStepChange(index)}
            >
              <div className="wizard-step-icon">
                {isCompleted ? (
                  <Check size={14} />
                ) : (
                  <Circle size={14} />
                )}
              </div>
              <div className="wizard-step-content">
                <div className="wizard-step-title">{step.title}</div>
                <div className="wizard-step-description">{step.description}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 네비게이션 버튼 */}
      <div className="wizard-navigation">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className="wizard-nav-button prev"
        >
          <ChevronLeft size={16} />
          이전
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          className="wizard-nav-button next"
        >
          다음
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default ProductFormWizard;

