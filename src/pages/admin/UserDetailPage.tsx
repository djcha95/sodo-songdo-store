// src/pages/admin/UserDetailPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { getPointHistory, deleteUserDocument } from '@/firebase/pointService';
import { updateUserRole, adjustUserCounts, setManualTierForUser } from '@/firebase/userService';
import { getUserOrders } from '@/firebase/orderService';
import { getUserWaitlist } from '@/firebase/productService';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import SodomallLoader from '@/components/common/SodomallLoader';
import toast from 'react-hot-toast';
import {
    Crown, Gem, Sparkles, ShieldAlert, ShieldX, ArrowLeft, Edit, Save, X, Database,
    Mail, Phone, Ban, ShieldCheck, ArrowUpCircle, ArrowDownCircle, Trash2, UserCog,
    User, ListOrdered, Hourglass, Activity, BarChart2, AlertTriangle, Shield
} from 'lucide-react';
import PointManagementModal from '@/components/admin/PointManagementModal';
import { formatPhoneNumber } from '@/utils/formatUtils';
import type { UserDocument, PointLog, LoyaltyTier, Order, WaitlistInfo, OrderStatus } from '@/types';
import type { Timestamp } from 'firebase/firestore';
import './UserDetailPage.css';
import { useAuth } from '@/context/AuthContext';

const tierInfo: Record<LoyaltyTier, { icon: React.ReactNode; color: string; }> = {
    '공구의 신': { icon: <Crown size={20} />, color: 'var(--loyalty-god)' },
    '공구왕': { icon: <Gem size={20} />, color: 'var(--loyalty-king)' },
    '공구요정': { icon: <Sparkles size={20} />, color: 'var(--loyalty-fairy)' },
    '공구새싹': { icon: <i className="seedling-icon-large">🌱</i>, color: 'var(--loyalty-sprout)' },
    '주의 요망': { icon: <ShieldAlert size={20} />, color: 'var(--loyalty-warning)' },
    '참여 제한': { icon: <ShieldX size={20} />, color: 'var(--loyalty-restricted)' },
};

const orderStatusInfo: Record<OrderStatus, { label: string; className: string }> = {
    RESERVED: { label: '예약', className: 'status-reserved' },
    PREPAID: { label: '선입금', className: 'status-prepaid' },
    PICKED_UP: { label: '픽업완료', className: 'status-picked-up' },
    COMPLETED: { label: '처리완료', className: 'status-picked-up' },
    CANCELED: { label: '취소', className: 'status-canceled' },
    NO_SHOW: { label: '노쇼', className: 'status-no-show' },
};

type Tab = 'profile' | 'orders' | 'waitlist' | 'points';

const UserDetailPage = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const { userDocument: currentAdmin } = useAuth();

    const [user, setUser] = useState<UserDocument | null>(null);
    const [isLoadingUser, setIsLoadingUser] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('profile');

    // --- 성능 최적화: 각 탭별 데이터 및 로딩 상태 분리 ---
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [waitlist, setWaitlist] = useState<WaitlistInfo[]>([]);
    const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(false);
    const [pointHistory, setPointHistory] = useState<PointLog[]>([]);
    const [isLoadingPoints, setIsLoadingPoints] = useState(false);
    const [fetchedTabs, setFetchedTabs] = useState<Set<Tab>>(new Set(['profile']));

    useDocumentTitle(user ? `${user.displayName || '고객'}님의 정보` : '고객 정보');

    // --- 성능 최적화: 초기에는 사용자 정보만 불러옵니다 ---
    useEffect(() => {
        if (!userId) {
            navigate('/admin/users');
            return;
        }
        setIsLoadingUser(true);
        const userRef = doc(db, 'users', userId);
        const unsubscribeUser = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                setUser({ uid: doc.id, ...doc.data() } as UserDocument);
            } else {
                toast.error("사용자 정보를 찾을 수 없습니다.");
                navigate('/admin/users');
            }
            setIsLoadingUser(false);
        });
        return () => unsubscribeUser();
    }, [userId, navigate]);

    // --- 성능 최적화: 탭이 변경될 때 해당 탭의 데이터를 처음 한 번만 불러옵니다 ---
    useEffect(() => {
        if (!userId || fetchedTabs.has(activeTab)) return;

        const fetchTabData = async () => {
            setFetchedTabs(prev => new Set(prev).add(activeTab));
            switch (activeTab) {
                case 'orders':
                    setIsLoadingOrders(true);
                    getUserOrders(userId).then(setOrders).finally(() => setIsLoadingOrders(false));
                    break;
                case 'waitlist':
                    setIsLoadingWaitlist(true);
                    getUserWaitlist(userId).then(setWaitlist).finally(() => setIsLoadingWaitlist(false));
                    break;
                case 'points':
                    setIsLoadingPoints(true);
                    getPointHistory(userId).then(setPointHistory).finally(() => setIsLoadingPoints(false));
                    break;
            }
        };
        fetchTabData();
    }, [activeTab, userId, fetchedTabs]);


    const sortedOrders = useMemo(() =>
        [...orders].sort((a, b) =>
            (b.createdAt as Timestamp).toMillis() - (a.createdAt as Timestamp).toMillis()
        ), [orders]);

    if (isLoadingUser || !user) return <SodomallLoader message="고객 상세 정보를 불러오는 중..." />;

    const renderTabContent = () => {
        switch (activeTab) {
            case 'orders':
                return isLoadingOrders 
                    ? <div className="tab-loader">주문 내역을 불러오는 중...</div>
                    : <OrderTable title="주문 전체 내역" orders={sortedOrders} />;
            case 'waitlist':
                return isLoadingWaitlist
                    ? <div className="tab-loader">대기 목록을 불러오는 중...</div>
                    : <WaitlistTable title="대기 목록" items={waitlist} />;
            case 'points':
                return isLoadingPoints
                    ? <div className="tab-loader">포인트 활동을 불러오는 중...</div>
                    : <PointTimeline title="포인트 활동" history={pointHistory} />;
            case 'profile':
            default:
                return <ProfileTab user={user} currentAdmin={currentAdmin} />;
        }
    };
    
    return (
        <div className="user-detail-page-container">
            <button onClick={() => navigate(-1)} className="back-button">
                <ArrowLeft size={20} />
                <span>고객 목록으로 돌아가기</span>
            </button>
            <UserDetailHeader user={user} />
            <div className="tab-navigation">
                <button className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}><User size={16}/>프로필</button>
                <button className={`tab-button ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}><ListOrdered size={16}/>주문 내역 ({orders.length})</button>
                <button className={`tab-button ${activeTab === 'waitlist' ? 'active' : ''}`} onClick={() => setActiveTab('waitlist')}><Hourglass size={16}/>대기 목록 ({waitlist.length})</button>
                <button className={`tab-button ${activeTab === 'points' ? 'active' : ''}`} onClick={() => setActiveTab('points')}><Activity size={16}/>포인트 활동</button>
            </div>
            <div className="tab-content">
                {renderTabContent()}
            </div>
        </div>
    );
};


// --- 서브 컴포넌트들 ---

const UserDetailHeader: React.FC<{ user: UserDocument }> = ({ user }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const userTier = user.loyaltyTier || '공구새싹';
    const info = tierInfo[userTier];

    const handleToggleSuspension = async () => {
        const newStatus = !user.isSuspended;
        const text = newStatus ? "제한" : "제한 해제";
        const promise = updateDoc(doc(db, 'users', user.uid), { isSuspended: newStatus });
        toast.promise(promise, { loading: `계정을 ${text} 처리하는 중...`, success: `계정이 성공적으로 ${text} 처리되었습니다.`, error: `계정 ${text} 처리에 실패했습니다.` });
    };

    return (
        <>
            <PointManagementModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} user={user} />
            <header className="user-detail-header">
                <div className="user-info">
                    <div className="user-tier-badge" style={{ color: info.color, backgroundColor: `${info.color}20` }}>
                        {info.icon}
                    </div>
                    <div>
                        <h1 className="user-name">{user.displayName} {user.nickname && `(${user.nickname})`}</h1>
                        <div className="user-tier-name" style={{color: info.color}}>{userTier}</div>
                    </div>
                </div>
                <div className="user-stats-summary">
                    <div className="stat-item">
                        <span className="stat-label">신뢰도 포인트</span>
                        <span className="stat-value">{(user.points || 0).toLocaleString()} P</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">총 주문</span>
                        <span className="stat-value">{user.totalOrders || 0} 건</span>
                    </div>
                </div>
                <div className="user-actions">
                    <button onClick={() => setIsModalOpen(true)} className="common-button button-primary-outline button-small"><Database size={16} />포인트 관리</button>
                    <button onClick={handleToggleSuspension} className={`common-button button-small ${user.isSuspended ? 'button-success-outline' : 'button-danger-outline'}`}>
                        {user.isSuspended ? <><ShieldCheck size={16} />제한 해제</> : <><Ban size={16} />이용 제한</>}
                    </button>
                </div>
            </header>
        </>
    );
};

const ProfileTab: React.FC<{ user: UserDocument; currentAdmin: UserDocument | null; }> = ({ user, currentAdmin }) => {
    return (
        <div className="profile-grid-container">
            <div className="profile-left-column">
                <UserInfoCard user={user} />
                {currentAdmin?.role === 'master' && (
                    <RoleManagementCard user={user} />
                )}
            </div>
            <div className="profile-right-column">
                <UserStatsCard user={user} />
                <TrustManagementCard user={user} />
                <DangerZoneCard user={user} />
            </div>
        </div>
    );
};

const TrustManagementCard: React.FC<{ user: UserDocument }> = ({ user }) => {
    const [pickupCount, setPickupCount] = useState(user.pickupCount || 0);
    const [noShowCount, setNoShowCount] = useState(user.noShowCount || 0);
    const [manualTier, setManualTier] = useState<LoyaltyTier | 'auto'>(user.manualTier || 'auto');

    useEffect(() => {
        setPickupCount(user.pickupCount || 0);
        setNoShowCount(user.noShowCount || 0);
        setManualTier(user.manualTier || 'auto');
    }, [user]);

    const handleCountsSave = () => {
        const promise = adjustUserCounts(user.uid, pickupCount, noShowCount);
        toast.promise(promise, {
            loading: '횟수 및 등급 재계산 중...',
            success: '성공적으로 반영되었습니다.',
            error: (err) => (err as Error).message || '작업 실패'
        });
    };

    const handleTierSave = () => {
        const newTier = manualTier === 'auto' ? null : manualTier;
        const promise = setManualTierForUser(user.uid, newTier);
        toast.promise(promise, {
            loading: '등급을 수동으로 적용하는 중...',
            success: '등급이 성공적으로 변경되었습니다.',
            error: (err) => (err as Error).message || '작업 실패'
        });
    };
    
    return (
        <div className="info-card">
            <h3><Shield size={20} />신뢰도 관리</h3>
            <div className="management-section">
                <h4>등급 직접 지정 (구제용)</h4>
                <p className="description">
                    {user.manualTier 
                        ? <>현재 <strong style={{color: 'var(--accent-color)'}}>{user.manualTier}</strong> 등급으로 수동 설정되어 있습니다.</> 
                        : "현재 픽업/노쇼 횟수에 따라 자동 계산됩니다."}
                </p>
                <div className="role-form">
                    <select value={manualTier} onChange={e => setManualTier(e.target.value as LoyaltyTier | 'auto')}>
                        <option value="auto">자동 계산</option>
                        <option value="공구의 신">공구의 신</option>
                        <option value="공구왕">공구왕</option>
                        <option value="공구요정">공구요정</option>
                        <option value="공구새싹">공구새싹</option>
                        <option value="주의 요망">주의 요망</option>
                        <option value="참여 제한">참여 제한</option>
                    </select>
                    <button onClick={handleTierSave} className="common-button button-primary button-small"><ShieldCheck size={14}/> 등급 적용</button>
                </div>
            </div>
            <hr className="divider" />
            <div className="management-section">
                <h4>픽업/노쇼 횟수 조정 (데이터 보정용)</h4>
                <div className="counts-form">
                    <div className="form-group-inline">
                        <label>픽업 완료</label>
                        <input type="number" value={pickupCount} onChange={e => setPickupCount(Number(e.target.value))} />
                    </div>
                    <div className="form-group-inline">
                        <label>노쇼</label>
                        <input type="number" value={noShowCount} onChange={e => setNoShowCount(Number(e.target.value))} />
                    </div>
                    <button onClick={handleCountsSave} className="common-button button-secondary button-small"><Save size={14}/> 횟수 저장</button>
                </div>
                <div className="warning-box">
                    <AlertTriangle size={16} />
                    <span><strong>주의:</strong> 이 값을 직접 수정하면 사용자의 등급 기록에 영구적인 영향을 미칩니다. 데이터 오류 수정이 필요한 명확한 경우에만 사용하세요.</span>
                </div>
            </div>
        </div>
    );
};

const UserInfoCard: React.FC<{ user: UserDocument }> = ({ user }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [nickname, setNickname] = useState(user.nickname || '');
    
    useEffect(() => {
        setNickname(user.nickname || '');
    }, [user]);

    const handleNicknameSave = async () => {
        if (nickname.trim().length > 7) {
            toast.error("닉네임은 7자 이하로 입력해주세요.");
            return;
        }
        const userRef = doc(db, 'users', user.uid);
        const promise = updateDoc(userRef, { nickname: nickname.trim() });
        toast.promise(promise, {
            loading: '닉네임 저장 중...',
            success: '닉네임이 저장되었습니다.',
            error: '닉네임 저장에 실패했습니다.'
        });
        await promise;
        setIsEditing(false);
    };

    return (
        <div className="info-card">
            <h3><User size={20} />기본 정보</h3>
            <div className="info-item">
                <span className="info-label">이름</span>
                <span className="info-value">{user.displayName}</span>
            </div>
            <div className="info-item">
                <span className="info-label">닉네임</span>
                {isEditing ? (
                    <div className="nickname-edit-form">
                        <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={7} placeholder="7자 이내" autoFocus />
                        <button onClick={handleNicknameSave} className="action-btn-icon" title="저장"><Save size={16} /></button>
                        <button onClick={() => setIsEditing(false)} className="action-btn-icon" title="취소"><X size={16} /></button>
                    </div>
                ) : (
                    <div className="info-value-group">
                        <span className="info-value">{user.nickname || '없음'}</span>
                        <button onClick={() => setIsEditing(true)} className="edit-nickname-btn" title="닉네임 수정"><Edit size={14} /></button>
                    </div>
                )}
            </div>
            <div className="info-item">
                <span className="info-label"><Mail size={14} /> 이메일</span>
                <span className="info-value">{user.email || '정보 없음'}</span>
            </div>
            <div className="info-item">
                <span className="info-label"><Phone size={14} /> 연락처</span>
                <span className="info-value">{formatPhoneNumber(user.phone)}</span>
            </div>
        </div>
    );
};

const UserStatsCard: React.FC<{ user: UserDocument }> = ({ user }) => (
    <div className="info-card">
        <h3><BarChart2 size={20} />주요 통계</h3>
        <div className="stats-grid">
            <div className="stat-item"><h4>신뢰도 포인트</h4><p>{(user.points || 0).toLocaleString()} P</p></div>
            <div className="stat-item"><h4>총 주문</h4><p>{user.totalOrders || 0} 건</p></div>
            <div className="stat-item"><h4>픽업율</h4><p>{user.pickupRate?.toFixed(1) ?? 'N/A'} %</p></div>
            <div className="stat-item"><h4>노쇼</h4><p>{user.noShowCount || 0} 회</p></div>
        </div>
    </div>
);

const RoleManagementCard: React.FC<{ user: UserDocument }> = ({ user }) => {
    const [selectedRole, setSelectedRole] = useState<UserDocument['role']>(user.role || 'customer');
    
    useEffect(() => {
        setSelectedRole(user.role || 'customer');
    }, [user]);

    const handleRoleSave = async () => {
        const promise = updateUserRole(user.uid, selectedRole);
        toast.promise(promise, {
            loading: "역할을 업데이트하는 중...",
            success: "역할이 변경되었습니다.",
            error: "역할 변경에 실패했습니다."
        });
    };

    return (
        <div className="info-card">
            <h3><UserCog size={20} /> 사용자 권한</h3>
            <div className="role-form">
                <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as UserDocument['role'])}>
                    <option value="customer">customer</option>
                    <option value="admin">admin</option>
                    <option value="master">master</option>
                </select>
                <button onClick={handleRoleSave} className="common-button button-primary button-small">권한 저장</button>
            </div>
        </div>
    );
};

const DangerZoneCard: React.FC<{ user: UserDocument }> = ({ user }) => {
    const navigate = useNavigate();

    const handleDeleteUser = () => {
        const userName = user.displayName || '해당 사용자';
        const performDelete = () => {
            const deletePromise = deleteUserDocument(user.uid).then(() => {
                navigate('/admin/users');
                return "사용자 문서가 성공적으로 삭제되었습니다.";
            });
            toast.promise(deletePromise, {
                loading: `${userName} 님을 삭제하는 중...`,
                success: (msg) => msg,
                error: (err) => `회원 삭제에 실패했습니다: ${(err as Error).message}`
            });
        };

        toast.custom((t) => (
            <DeletionConfirmToast t={t} user={user} onConfirm={() => {
                toast.dismiss(t.id);
                performDelete();
            }} />
        ), { duration: Infinity, position: 'top-center' });
    };

    return (
        <div className="info-card danger-zone-card">
            <h3><ShieldAlert size={20} /> 위험 구역</h3>
            <div className="danger-zone-content">
                <div className="danger-zone-text">
                    <h4>회원 영구 삭제</h4>
                    <p>이 작업은 되돌릴 수 없습니다. 신중하게 결정해주세요.</p>
                </div>
                <button onClick={handleDeleteUser} className="common-button button-danger-outline">
                    <Trash2 size={16} /> 회원 삭제
                </button>
            </div>
        </div>
    );
};

const DeletionConfirmToast: React.FC<{ t: { id: string }; user: UserDocument; onConfirm: () => void; }> = ({ t, user, onConfirm }) => {
    const [confirmText, setConfirmText] = useState('');
    const CONFIRM_PHRASE = '회원 삭제';
    const isMatch = confirmText === CONFIRM_PHRASE;

    return (
        <div className="delete-confirm-toast">
            <div className="toast-header"> <AlertTriangle className="toast-icon" size={24} /> <h3 className="toast-title">회원 영구 삭제</h3> </div>
            <div className="toast-body">
                <p><b>{user.displayName}</b> ({user.email}) 님을 정말 삭제하시겠습니까?<br/>이 작업은 되돌릴 수 없으며, 모든 데이터가 영구적으로 삭제됩니다.</p>
                <label htmlFor="delete-confirm-input" className="toast-instruction">삭제를 계속하려면 아래에 <strong className="confirm-phrase">{CONFIRM_PHRASE}</strong> 라고 입력하세요.</label>
                <input id="delete-confirm-input" type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="delete-confirm-input" placeholder={CONFIRM_PHRASE} autoFocus />
            </div>
            <div className="toast-footer">
                <button className="toast-button toast-button-cancel" onClick={() => toast.dismiss(t.id)}>취소</button>
                <button className="toast-button toast-button-confirm" onClick={onConfirm} disabled={!isMatch}><Trash2 size={16} /> 삭제 확인</button>
            </div>
        </div>
    );
};

const OrderTable: React.FC<{ title: string; orders: Order[] }> = ({ title, orders }) => (
    <div className="info-card">
        <h3>{title} ({orders.length})</h3>
        {orders.length > 0 ? (
            <div className="table-responsive">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>예약일</th> <th>상품 정보</th> <th>수량</th> <th>금액</th> <th>픽업일</th> <th>상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map(order => (
                            <tr key={order.id}>
                                <td>{(order.createdAt as Timestamp)?.toDate().toLocaleDateString('ko-KR')}</td>
                                <td>{order.items.map(item => item.productName).join(', ')}</td>
                                <td>{order.items.reduce((acc, item) => acc + item.quantity, 0)}</td>
                                <td>{order.totalPrice.toLocaleString()}원</td>
                                <td>{(order.pickupDate as Timestamp)?.toDate().toLocaleDateString('ko-KR')}</td>
                                <td><span className={`status-badge-inline ${orderStatusInfo[order.status]?.className || ''}`}>{orderStatusInfo[order.status]?.label || order.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : <p className="no-data-message">{title}이 없습니다.</p>}
    </div>
);

const WaitlistTable: React.FC<{ title: string; items: WaitlistInfo[] }> = ({ title, items }) => (
    <div className="info-card">
        <h3>{title} ({items.length})</h3>
        {items.length > 0 ? (
            <div className="table-responsive">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>신청일</th> <th>상품명</th> <th>옵션</th> <th>수량</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(item => (
                            <tr key={`${item.productId}-${item.roundId}-${item.itemId}`}>
                                <td>{item.timestamp.toDate().toLocaleDateString('ko-KR')}</td>
                                <td>{item.productName}</td>
                                <td>{item.itemName}</td>
                                <td>{item.quantity}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : <p className="no-data-message">{title}이 없습니다.</p>}
    </div>
);

const PointTimeline: React.FC<{ title: string; history: PointLog[] }> = ({ title, history }) => (
    <div className="info-card">
        <h3>{title}</h3>
        {history.length > 0 ? (
            <ul className="point-timeline">
                {history.map((log, index) => (
                    <li key={`${(log.createdAt as Timestamp)?.seconds}-${index}`} className="timeline-item">
                        <div className={`timeline-icon ${log.amount > 0 ? 'positive' : 'negative'}`}>{log.amount > 0 ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}</div>
                        <div className="timeline-content">
                            <p className="timeline-reason">{log.reason}</p>
                            <span className="timeline-date">{(log.createdAt as Timestamp)?.toDate().toLocaleString('ko-KR')}</span>
                        </div>
                        <span className={`timeline-amount ${log.amount > 0 ? 'positive' : 'negative'}`}>{log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()} P</span>
                    </li>
                ))}
            </ul>
        ) : <p className="no-data-message">{title} 내역이 없습니다.</p>}
    </div>
);

export default UserDetailPage;