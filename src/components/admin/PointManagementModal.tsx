// src/components/admin/PointManagementModal.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { adjustUserPoints, getPointHistory, updatePointLog, deletePointLog, deleteMultiplePointLogs } from '@/firebase/pointService';
import { createNotification } from '@/firebase/notificationService';
import { X, Loader2, Edit, Save, Trash2, XCircle, AlertTriangle, Search, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PointLog, UserDocument as AppUser } from '@/shared/types';
import type { Timestamp } from 'firebase/firestore';
import './PointManagementModal.css';

interface PointManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser | null;
}

const PointManagementModal: React.FC<PointManagementModalProps> = ({ isOpen, onClose, user }) => {
  // 지급/차감 폼 상태
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<'grant' | 'deduct'>('grant');

  // 내역 및 로딩 상태
  const [history, setHistory] = useState<PointLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 인라인 수정을 위한 상태
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');

  // ✅ [신규] 기능 상태: 검색어, 선택된 로그 ID
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);

  const refreshHistory = useCallback(() => {
    if (user) {
      setHistoryLoading(true);
      getPointHistory(user.uid)
        .then(setHistory)
        .catch(() => toast.error('최신 내역 로딩 실패'))
        .finally(() => setHistoryLoading(false));
    }
  }, [user]);

  // 모달이 열릴 때/사용자가 바뀔 때 상태 초기화
  useEffect(() => {
    if (isOpen && user) {
      refreshHistory();
    } else {
      setAmount('');
      setReason('');
      setAction('grant');
      setHistory([]);
      setEditingLogId(null);
      setSearchTerm('');
      setSelectedLogIds([]);
    }
  }, [isOpen, user, refreshHistory]);

  // ✅ [신규] 검색어에 따라 필터링된 내역
  const filteredHistory = useMemo(() => {
    return history.filter(log =>
      log.reason.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [history, searchTerm]);

  // ✅ [신규] 필터링된 내역에 대한 요약 통계
  const summaryStats = useMemo(() => {
    return filteredHistory.reduce(
      (acc, log) => {
        if (log.amount > 0) acc.gained += log.amount;
        else acc.used += log.amount;
        acc.net += log.amount;
        return acc;
      },
      { gained: 0, used: 0, net: 0 }
    );
  }, [filteredHistory]);


  // --- 이벤트 핸들러 ---

  const handleStartEdit = (log: PointLog) => {
    setEditingLogId(log.id);
    setSelectedLogIds([]); // 수정 시작 시 다른 선택은 모두 해제
    setEditAmount(String(Math.abs(log.amount)));
    setEditReason(log.reason.replace(/^\((수동|수정)\)\s*/, ''));
  };

  const handleCancelEdit = () => setEditingLogId(null);

  // ✅ [개선] Enter 키로 수정 완료
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleUpdate();
    }
    if (e.key === 'Escape') handleCancelEdit();
  };
  
  // ✅ [개선] Enter 키로 신규 내역 추가
  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAddNewPoint();
    }
  };

  // ✅ [신규] 개별 로그 선택/해제 핸들러
  const handleSelectLog = (logId: string) => {
    setSelectedLogIds(prev =>
      prev.includes(logId)
        ? prev.filter(id => id !== logId)
        : [...prev, logId]
    );
  };
  
  // ✅ [신규] 전체 선택/해제 핸들러
  const handleSelectAll = () => {
    const allVisibleIds = filteredHistory.map(log => log.id).filter(id => !id.startsWith('temp-'));
    if (selectedLogIds.length === allVisibleIds.length) {
      setSelectedLogIds([]);
    } else {
      setSelectedLogIds(allVisibleIds);
    }
  };

  // --- 데이터 CRUD 함수 ---
  const handleUpdate = async () => {
    if (!user || !editingLogId) return;

    const pointAmount = parseInt(editAmount, 10);
    if (isNaN(pointAmount) || pointAmount < 0) {
      toast.error('유효한 포인트를 입력해주세요 (0 이상).');
      return;
    }
    if (!editReason.trim()) {
      toast.error('조정 사유를 입력해주세요.');
      return;
    }

    const originalLog = history.find(h => h.id === editingLogId);
    if (!originalLog) return;
    
    const finalAmount = originalLog.amount >= 0 ? pointAmount : -pointAmount;
    const finalReason = `(수정) ${editReason.trim()}`;

    const promise = updatePointLog(user.uid, editingLogId, finalAmount, finalReason);
    toast.promise(promise, {
      loading: '포인트 내역을 수정하는 중...',
      success: () => {
        refreshHistory();
        handleCancelEdit();
        return '포인트 내역이 수정되었습니다.';
      },
      error: (err) => `수정 실패: ${(err as Error).message}`,
    });
   };

  const handleDelete = (log: PointLog) => {
    if (!user) return;
    toast.custom((t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} toast-confirm-container`}>
          <h4><AlertTriangle size={20} /> 내역 삭제 확인</h4>
          <p>
            '{log.reason}' ({log.amount.toLocaleString()}P) 내역을 정말 삭제하시겠습니까?
            <br />사용자의 총 포인트가 변경됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="toast-buttons">
            <button className="button-secondary" onClick={() => toast.dismiss(t.id)}>취소</button>
            <button className="button-danger" onClick={() => {
                toast.dismiss(t.id);
                const promise = deletePointLog(user.uid, log.id);
                toast.promise(promise, {
                  loading: '포인트 내역을 삭제하는 중...',
                  success: () => {
                    refreshHistory();
                    return '포인트 내역이 삭제되었습니다.';
                  },
                  error: (err) => `삭제 실패: ${(err as Error).message}`,
                });
              }}
            >
              삭제
            </button>
          </div>
        </div>
      ), { duration: 6000 });
   };

  const handleAddNewPoint = async () => {
    if (!user || isSubmitting) return;

    const pointAmount = parseInt(amount, 10);
    if (isNaN(pointAmount) || pointAmount <= 0) { toast.error('유효한 포인트를 입력해주세요.'); return; }
    if (!reason.trim()) { toast.error('조정 사유를 입력해주세요.'); return; }

    setIsSubmitting(true);
    const finalAmount = action === 'grant' ? pointAmount : -pointAmount;

    try {
      await adjustUserPoints(user.uid, finalAmount, reason.trim());
      
      const notificationMessage = `[${reason.trim()}] 사유로 소도 포인트 ${pointAmount.toLocaleString()}P가 ${action === 'grant' ? '지급' : '차감'}되었습니다.`;
      const notificationType = action === 'grant' ? 'POINTS_EARNED' : 'POINTS_USED';
      
      await createNotification(user.uid, notificationMessage, { type: notificationType, link: '/mypage/points' });

      toast.success('포인트가 조정되고 알림이 발송되었습니다!');
      setAmount('');
      setReason('');
      refreshHistory();
    } catch (err) {
      toast.error(`작업 실패: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ [신규] 선택된 내역 일괄 삭제
  const handleDeleteSelected = () => {
    if (!user || selectedLogIds.length === 0) return;

    toast.custom((t) => (
        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} toast-confirm-container`}>
          <h4><AlertTriangle size={20} /> 일괄 삭제 확인</h4>
          <p>
            선택된 <strong>{selectedLogIds.length}개</strong>의 내역을 정말 삭제하시겠습니까?
            <br />사용자의 총 포인트가 변경됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="toast-buttons">
            <button className="button-secondary" onClick={() => toast.dismiss(t.id)}>취소</button>
            <button className="button-danger" onClick={() => {
                toast.dismiss(t.id);
                const promise = deleteMultiplePointLogs(user.uid, selectedLogIds);
                toast.promise(promise, {
                  loading: '선택된 내역을 삭제하는 중...',
                  success: () => {
                    refreshHistory();
                    setSelectedLogIds([]);
                    return `${selectedLogIds.length}개의 내역이 삭제되었습니다.`;
                  },
                  error: (err) => `삭제 실패: ${(err as Error).message}`,
                });
              }}
            >
              삭제 확인
            </button>
          </div>
        </div>
      ), { duration: 6000 });
  };


  if (!isOpen || !user) return null;
  const currentTotalPoints = history.reduce((acc, log) => acc + log.amount, 0);
  const allVisibleMutiableIds = filteredHistory.map(log => log.id).filter(id => !id.startsWith('temp-'));

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-content" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3><GripVertical size={20} style={{marginRight: '8px', color: '#adb5bd'}}/>소도 포인트 관리</h3>
          <button onClick={onClose} className="admin-modal-close-button"><X size={24} /></button>
        </div>
        <div className="admin-modal-body">
          <p><strong>{user.displayName}{user.nickname ? ` (${user.nickname})` : ''}</strong> 님의 포인트를 조정합니다.</p>
          <p className="current-points">현재 소도 포인트: <strong>{currentTotalPoints.toLocaleString()} P</strong></p>

          <div className="point-adjustment-form">
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
              <textarea id="point-reason" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={handleAddKeyDown} placeholder="예: 커뮤니티 홍보 인증 (Shift+Enter로 줄바꿈)" />
            </div>
            <button onClick={handleAddNewPoint} className="modal-button primary full-width" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="spin-icon" /> : '신규 내역 추가'}
            </button>
          </div>

          <hr className="modal-divider" />

          <div className="point-history-container">
            <div className="history-header">
                <h4>포인트 변동 내역 ({filteredHistory.length})</h4>
                <div className="history-search-bar">
                    <Search size={18} className="search-icon"/>
                    <input 
                        type="text" 
                        placeholder="사유로 검색..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            
            <div className="history-summary">
                <span>총 획득: <strong className="positive">+{summaryStats.gained.toLocaleString()} P</strong></span>
                <span>총 사용: <strong className="negative">{summaryStats.used.toLocaleString()} P</strong></span>
                <span>순변동: <strong className={summaryStats.net >= 0 ? 'positive' : 'negative'}>{summaryStats.net >= 0 ? '+' : ''}{summaryStats.net.toLocaleString()} P</strong></span>
            </div>

            
            {selectedLogIds.length > 0 && (
                <div className="batch-actions-bar">
                    <span>{selectedLogIds.length}개 항목 선택됨</span>
                    <button onClick={handleDeleteSelected} className="batch-delete-button">
                        <Trash2 size={16}/> 선택 항목 삭제
                    </button>
                </div>
            )}
            
            {historyLoading ? (
              <div className="history-loader"><Loader2 className="spin-icon" /></div>
            ) : (
              <ul className="point-history-list">
                <li className="list-header">
                    <input 
                        type="checkbox"
                        title="전체 선택"
                        checked={allVisibleMutiableIds.length > 0 && selectedLogIds.length === allVisibleMutiableIds.length}
                        onChange={handleSelectAll}
                        disabled={allVisibleMutiableIds.length === 0}
                    />
                    <span className="header-date">날짜</span>
                    <span className="header-reason">사유</span>
                    <span className="header-amount">변동</span>
                    <span className="header-actions">관리</span>
                </li>
                {filteredHistory.length > 0 ? filteredHistory.map(log => (
                  <li key={log.id} className={`${editingLogId === log.id ? 'editing' : ''} ${selectedLogIds.includes(log.id) ? 'selected' : ''}`}>
                    {editingLogId === log.id ? (
                      <div className="history-edit-form">
                        <div className="edit-inputs">
                            <input
                              type="number"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              className="edit-amount-input"
                              autoFocus
                            /> P
                            <input
                              type="text"
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              className="edit-reason-input"
                            />
                        </div>
                        <div className="edit-actions">
                          <button onClick={handleUpdate} title="저장"><Save size={16} className="icon-save" /></button>
                          <button onClick={handleCancelEdit} title="취소"><XCircle size={16} className="icon-cancel" /></button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <input
                            type="checkbox"
                            checked={selectedLogIds.includes(log.id)}
                            onChange={() => handleSelectLog(log.id)}
                            disabled={log.id.startsWith('temp-')}
                        />
                        <span className="history-date">{(log.createdAt as Timestamp)?.toDate().toLocaleDateString('ko-KR')}</span>
                        <span className="history-reason" title={log.reason}>{log.reason}</span>
                        <span className={`history-amount ${log.amount > 0 ? 'positive' : 'negative'}`}>{log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()} P</span>
                        <div className="history-item-actions">
                          {!log.id.startsWith('temp-') && (
                            <>
                              <button onClick={() => handleStartEdit(log)} title="수정"><Edit size={14} /></button>
                              <button onClick={() => handleDelete(log)} title="삭제"><Trash2 size={14} /></button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                )) : <p className="no-history">표시할 내역이 없습니다.</p>}
              </ul>
            )}
          </div>
        </div>
        <div className="admin-modal-footer">
          <button onClick={onClose} className="modal-button secondary">닫기</button>
        </div>
      </div>
    </div>
  );
};

export default PointManagementModal;