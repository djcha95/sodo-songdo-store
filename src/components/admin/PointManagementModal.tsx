// src/components/admin/PointManagementModal.tsx

import React, { useState, useEffect } from 'react';
import { adjustUserPoints, getPointHistory } from '@/firebase/pointService';
import { createNotification } from '@/firebase/notificationService';
import { X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PointLog, UserDocument as AppUser } from '@/types';
import type { Timestamp } from 'firebase/firestore';
import './PointManagementModal.css';

interface PointManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser | null;
}

const PointManagementModal: React.FC<PointManagementModalProps> = ({ isOpen, onClose, user }) => {
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [action, setAction] = useState<'grant' | 'deduct'>('grant');
    const [history, setHistory] = useState<PointLog[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        if (isOpen && user) {
            setHistoryLoading(true);
            getPointHistory(user.uid, 5)
                .then(setHistory)
                .catch(() => toast.error("최근 내역 로딩 실패"))
                .finally(() => setHistoryLoading(false));
        } else {
            setAmount('');
            setReason('');
            setAction('grant');
            setHistory([]);
        }
    }, [isOpen, user]);

    const handleSave = async () => {
        if (!user) return;
        const pointAmount = parseInt(amount, 10);
        if (isNaN(pointAmount) || pointAmount <= 0) { toast.error("유효한 포인트를 입력해주세요."); return; }
        if (!reason.trim()) { toast.error("조정 사유를 입력해주세요."); return; }

        const finalAmount = action === 'grant' ? pointAmount : -pointAmount;
        
        const executionPromise = async () => {
            await adjustUserPoints(user.uid, finalAmount, reason);
            
            // ✅ [수정] 알림 메시지에 조정 '사유'를 포함
            const notificationMessage = `[${reason}] 사유로 신뢰도 포인트 ${pointAmount.toLocaleString()}P가 ${action === 'grant' ? '지급' : '차감'}되었습니다.`;
            const notificationType = action === 'grant' ? 'POINTS_EARNED' : 'POINTS_USED';
            
            await createNotification(user.uid, notificationMessage, {
                type: notificationType,
                link: '/mypage/points'
            });
        };

        toast.promise(
            executionPromise(), 
            {
                loading: '포인트 조정 및 알림 발송 중...',
                success: () => {
                    onClose();
                    return '포인트가 조정되고 알림이 발송되었습니다!';
                },
                error: (err) => (err as Error).message || '작업에 실패했습니다.'
            }
        );
    };

    if (!isOpen || !user) return null;

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
                <div className="admin-modal-header">
                    <h3>신뢰도 포인트 관리</h3>
                    <button onClick={onClose} className="admin-modal-close-button"><X size={24}/></button>
                </div>
                <div className="admin-modal-body">
                    <p><strong>{user.displayName}{user.nickname ? ` (${user.nickname})` : ''}</strong> 님의 포인트를 조정합니다.</p>
                    <p className="current-points">현재 신뢰도 포인트: <strong>{(user.points || 0).toLocaleString()} P</strong></p>
                    <div className="point-action-selector">
                        <button className={action === 'grant' ? 'active' : ''} onClick={() => setAction('grant')}>지급</button>
                        <button className={action === 'deduct' ? 'active' : ''} onClick={() => setAction('deduct')}>차감</button>
                    </div>
                    <div className="form-group">
                        <label htmlFor="point-amount">조정할 포인트</label>
                        <input id="point-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="숫자만 입력" />
                    </div>
                    <div className="form-group">
                        <label htmlFor="point-reason">조정 사유</label>
                        <textarea id="point-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 커뮤니티 홍보 인증" />
                    </div>
                    <div className="point-history-preview">
                        <h4>최근 변동 내역 (최대 5건)</h4>
                        {historyLoading ? (
                            <div className="history-loader"><Loader2 className="spin-icon" /></div>
                        ) : (
                            <ul>
                                {history.length > 0 ? history.map(log => (
                                    <li key={log.id}>
                                        <span className="history-date">{(log.createdAt as Timestamp)?.toDate().toLocaleDateString('ko-KR')}</span>
                                        <span className="history-reason">{log.reason}</span>
                                        <span className={`history-amount ${log.amount > 0 ? 'positive' : 'negative'}`}>{log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()} P</span>
                                    </li>
                                )) : <p>최근 포인트 변동 내역이 없습니다.</p>}
                            </ul>
                        )}
                    </div>
                </div>
                <div className="admin-modal-footer">
                    <button onClick={onClose} className="modal-button secondary">취소</button>
                    <button onClick={handleSave} className="modal-button primary">저장</button>
                </div>
            </div>
        </div>
    );
};

export default PointManagementModal;