// src/pages/customer/PointHistoryPage.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getPointHistory } from '@/firebase';
import type { PointLog } from '@/types';
import { TrendingUp, TrendingDown, HelpCircle, ShoppingCart, History, X } from 'lucide-react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import { motion, AnimatePresence } from 'framer-motion';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';
import './PointHistoryPage.css';

const formatDate = (timestamp: any) => {
    if (!timestamp || typeof timestamp.toDate !== 'function') return '-';
    return timestamp.toDate().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const PointGuideModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-content"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h4>✨ 소도몰 포인트 안내</h4>
              <button onClick={onClose} className="modal-close-button">
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <h5>💰 활동 포인트: 즐거운 활동이 포인트가 되어 돌아옵니다!</h5>
              <p>
                신뢰 등급과는 별개로, 소도몰에서의 다양한 활동을 통해 포인트를 쌓고, 특별한 혜택을 누릴 수 있습니다. 포인트는 사장님의 즐거운 활동에 대한 감사의 선물이에요!
              </p>
              <h6>이렇게 쌓아요!</h6>
              <ul>
                <li><strong>상품 픽업 완료:</strong> 결제 금액의 0.5% 적립</li>
                <li><strong>매일 첫 로그인:</strong> +1P</li>
                <li><strong>한 달 연속 출석:</strong> +100P 보너스</li>
                <li><strong>친구 초대 성공:</strong> +30P</li>
                <li><strong>리뷰 작성:</strong> +5P</li>
              </ul>
              <h6>이렇게 사용해요!</h6>
              <ul>
                <li><strong>대기 순번 상승권:</strong> 50P를 사용하여 인기 상품의 대기 순번을 위로 올릴 수 있습니다.</li>
              </ul>
              <h6>🤝 우리 모두의 약속</h6>
              <p>
                원활하고 공정한 공동구매를 위해, 노쇼(미픽업)나 마감 임박 취소 시에는 활동 포인트가 일부 차감될 수 있어요. 모두를 위한 약속이랍니다!
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const PointLogItem: React.FC<{ log: PointLog }> = ({ log }) => {
    const isPositive = log.amount > 0;
    return (
        <li className="point-history-item">
            <div className="point-item-icon" data-positive={isPositive}>
                {isPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
            <div className="point-item-details">
                <span className="point-item-reason">{log.reason}</span>
                <div className="point-item-meta">
                    <span className="point-item-date">{formatDate(log.createdAt)}</span>
                    {log.orderId && (
                        <Tippy content={`주문 ID: ${log.orderId}`}>
                            <span className="point-item-order-ref">
                                <ShoppingCart size={12} />
                            </span>
                        </Tippy>
                    )}
                </div>
            </div>
            <div className={`point-item-amount ${isPositive ? 'positive' : 'negative'}`}>
                {isPositive ? '+' : ''}{log.amount.toLocaleString()} P
            </div>
        </li>
    );
};

const PointHistoryPage: React.FC = () => {
    const { user, userDocument } = useAuth();
    const [history, setHistory] = useState<PointLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

    useEffect(() => {
        if (user?.uid) {
            // ✅ [수정] 불필요한 두 번째 인자 제거
            getPointHistory(user.uid)
                .then(setHistory)
                .catch(err => console.error("포인트 내역 로딩 실패:", err))
                .finally(() => setLoading(false));
        }
    }, [user]);

    const renderContent = () => {
        if (loading) {
            return <div className="point-history-loader"><InlineSodomallLoader /></div>;
        }
        if (history.length === 0) {
            return <div className="point-history-message">포인트 변동 내역이 없습니다.</div>;
        }
        return (
            <ul className="point-history-list">
                {history.map(log => <PointLogItem key={log.id} log={log} />)}
            </ul>
        );
    };

    return (
        <div className="point-history-page-container">
            <div className="point-history-container">
                <header className="point-history-header">
                    <div className="page-title-wrapper">
                      <History size={24} />
                      <h2>포인트 내역</h2>
                    </div>
                    <div className="current-points-display-v2">
                        <div className="points-label">
                          <TrendingUp size={18} />
                          <span>현재 활동 포인트</span>
                        </div>
                        <div className="points-value">
                          <strong>{(userDocument?.points || 0).toLocaleString()} P</strong>
                        </div>
                    </div>
                </header>
                <main className="point-history-content">
                    <div className="section-header">
                        <h4>최근 내역</h4>
                        <button onClick={() => setIsGuideModalOpen(true)} className="guide-button">
                            <HelpCircle size={16} />
                            포인트 안내
                        </button>
                    </div>
                    {renderContent()}
                </main>
            </div>
            <PointGuideModal isOpen={isGuideModalOpen} onClose={() => setIsGuideModalOpen(false)} />
        </div>
    );
};

export default PointHistoryPage;