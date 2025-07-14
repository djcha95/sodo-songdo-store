// src/pages/customer/PointHistoryPage.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getPointHistory } from '@/firebase';
import type { PointLog } from '@/types';
import { TrendingUp, TrendingDown, History } from 'lucide-react';
import './PointHistoryPage.css';

// 날짜 포맷팅 헬퍼
const formatDate = (timestamp: any) => {
    if (!timestamp || typeof timestamp.toDate !== 'function') return '-';
    return timestamp.toDate().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
};

const PointHistoryPage: React.FC = () => {
    const { user, userDocument } = useAuth();
    const [history, setHistory] = useState<PointLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user?.uid) {
            getPointHistory(user.uid)
                .then(setHistory)
                .catch(err => console.error("포인트 내역 로딩 실패:", err))
                .finally(() => setLoading(false));
        }
    }, [user]);

    const renderContent = () => {
        if (loading) {
            return <div className="point-history-message">포인트 내역을 불러오는 중...</div>;
        }
        if (history.length === 0) {
            return <div className="point-history-message">포인트 변동 내역이 없습니다.</div>;
        }
        return (
            <ul className="point-history-list">
                {history.map(log => {
                    const isPositive = log.amount > 0;
                    return (
                        <li key={log.id} className="point-history-item">
                            <div className="point-item-icon" data-positive={isPositive}>
                                {isPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                            </div>
                            <div className="point-item-details">
                                <span className="point-item-reason">{log.reason}</span>
                                <span className="point-item-date">{formatDate(log.createdAt)}</span>
                            </div>
                            <div className={`point-item-amount ${isPositive ? 'positive' : 'negative'}`}>
                                {isPositive ? '+' : ''}{log.amount.toLocaleString()}점
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    };

    return (
        <div className="point-history-container">
            <header className="point-history-header">
                <h2>포인트 내역</h2>
                <div className="current-points-display">
                    <span>현재 포인트</span>
                    <strong>{(userDocument?.loyaltyPoints || 0).toLocaleString()}점</strong>
                </div>
            </header>
            <div className="point-history-content">
                {renderContent()}
            </div>
        </div>
    );
};

export default PointHistoryPage;