// src/components/common/TutorialModal.tsx

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, Clock, Truck, Gem } from 'lucide-react';
import './TutorialModal.css';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const tutorialSteps = [
  {
    icon: <Flame size={32} />,
    title: '오늘의 공동구매',
    description: '매일 오후 2시에 새로운 상품이 올라와요. 마감 시간 전까지 자유롭게 예약하고, 맛있는 상품을 가장 먼저 만나보세요!',
  },
  {
    icon: <Clock size={32} />,
    title: '마감임박 추가공구',
    description: '아쉽게 놓친 상품이 있나요? 픽업일 점심까지 일부 상품을 추가로 예약할 수 있는 마지막 기회랍니다!',
  },
  {
    icon: <Truck size={32} />,
    title: '편리한 지정일 픽업',
    description: '모든 상품은 정해진 날짜에 매장에서 직접 픽업해요. 픽업일을 달력에서 확인하고 잊지 말고 찾아가세요!',
  },
  {
    icon: <Gem size={32} />,
    title: '신뢰 등급 시스템',
    description: '꾸준한 픽업으로 약속을 지켜주시면 신뢰 등급이 올라가요. 높은 등급의 회원님께는 특별한 혜택이 기다리고 있답니다!',
  },
];

const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="tutorial-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="tutorial-modal-content"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tutorial-modal-header">
              <h3>소도몰에 오신 것을 환영합니다! 🎉</h3>
              <p>잠깐! 소도몰 이용법을 간단히 알아볼까요?</p>
              <button onClick={onClose} className="tutorial-modal-close-button">
                <X size={24} />
              </button>
            </div>
            <div className="tutorial-modal-body">
              <div className="tutorial-steps-grid">
                {tutorialSteps.map((step, index) => (
                  <div className="tutorial-step-card" key={index}>
                    <div className="step-icon">{step.icon}</div>
                    <h4 className="step-title">{step.title}</h4>
                    <p className="step-description">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="tutorial-modal-footer">
              <button className="common-button button-primary button-large" onClick={onClose}>
                시작하기
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TutorialModal;

