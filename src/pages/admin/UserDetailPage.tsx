// src/pages/admin/UserDetailPage.tsx

import { useState, useEffect, useCallback } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, orderBy, doc, Timestamp, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Loader, User, Crown } from 'lucide-react';
import './UserDetailPage.css';
import toast from 'react-hot-toast';
import type { UserDocument, Order } from '../../types'; // ✅ [수정] DocumentData 및 OrderStatus 제거

// 공통 로딩 스피너 컴포넌트
const LoadingSpinner = () => (
    <div className="loading-overlay">
        <Loader size={48} className="spin" />
        <p>데이터를 불러오는 중...</p>
    </div>
);

const UserDetailPage = () => {
    useDocumentTitle('고객 상세 정보');

    const { userId } = useParams<{ userId: string }>();
    const [user, setUser] = useState<UserDocument | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);

    // 주문 통계 계산 (실시간 데이터 기반)
    const totalOrders = orders.length;
    // PICKED_UP 또는 COMPLETED 상태의 주문만 픽업 완료로 간주
    const pickedUpOrders = orders.filter(order => order.status === 'PICKED_UP' || order.status === 'COMPLETED').length;
    const pickupRate = totalOrders > 0 ? ((pickedUpOrders / totalOrders) * 100).toFixed(1) : '0';

    useEffect(() => {
        if (!userId) {
            console.error("userId가 URL 파라미터로 제공되지 않았습니다.");
            setIsLoading(false);
            setUser(null);
            return;
        }

        setIsLoading(true);

        // 사용자 정보를 실시간으로 감지
        const userRef = doc(db, 'users', userId);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                setUser({ uid: docSnap.id, ...docSnap.data() } as UserDocument);
            } else {
                setUser(null);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("사용자 정보 실시간 로딩 오류:", error);
            setIsLoading(false);
            setUser(null);
            toast.error("사용자 정보를 불러오는 데 실패했습니다.");
        });

        // 주문 내역 실시간 감지
        const ordersQuery = query(
            collection(db, 'orders'),
            where('userId', '==', userId),
            orderBy('createdAt', 'desc') // createdAt 기준으로 정렬
        );

        const unsubscribeOrders = onSnapshot(ordersQuery, (querySnapshot) => {
            const ordersData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Order));
            setOrders(ordersData);
        }, (error) => {
            console.error("주문 내역 실시간 로딩 오류:", error);
            setOrders([]);
            toast.error("주문 내역을 불러오는 데 실패했습니다.");
        });

        return () => {
            unsubscribeUser();
            unsubscribeOrders();
        };
    }, [userId]);

    // 이용 제한 상태 토글
    const handleToggleRestriction = useCallback(async () => {
        if (!user) return;
        setIsUpdating(true);
        const userRef = doc(db, 'users', user.uid);
        try {
            await updateDoc(userRef, { isRestricted: !user.isRestricted });
            toast.success(`사용자 ${user.displayName}님의 이용 제한 상태가 ${user.isRestricted ? '해제' : '설정'}되었습니다.`);
        } catch (error) {
            console.error("이용 제한 상태 변경 실패:", error);
            toast.error("상태 변경에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsUpdating(false);
        }
    }, [user]);

    // 관리자 권한 토글
    const handleToggleAdminRole = useCallback(async () => {
        if (!user) return;
        setIsUpdating(true);
        const userRef = doc(db, 'users', user.uid);
        const newRole = user.role === 'admin' ? 'customer' : 'admin';
        try {
            await updateDoc(userRef, { role: newRole });
            toast.success(`사용자 ${user.displayName}님의 권한이 ${newRole}으로 변경되었습니다.`);
        } catch (error) {
            console.error("관리자 권한 변경 실패:", error);
            toast.error("권한 변경에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsUpdating(false);
        }
    }, [user]);

    if (isLoading) {
        return <LoadingSpinner />;
    }

    if (!user) {
        return (
            <div className="user-detail-container">
                <Link to="/admin/users" className="back-link">&larr; 모든 고객 목록으로 돌아가기</Link>
                <p className="no-data-message">해당 고객을 찾을 수 없습니다.</p>
            </div>
        );
    }

    return (
        <div className="user-detail-container">
            {isUpdating && <LoadingSpinner />}
            <Link to="/admin/users" className="back-link">&larr; 모든 고객 목록으로 돌아가기</Link>

            {/* 사용자 정보 및 관리 버튼 카드 */}
            <div className="user-info-card">
                <div className="user-details-left">
                    <h2 className="user-name">{user.displayName || '이름 없음'}</h2>
                    <p className="user-email">{user.email}</p>
                    <p className="no-show-count">노쇼 횟수: {user.noShowCount || 0}회</p>
                    <p className="user-role-info">
                        권한: <span className={`role-${user.role || 'customer'}`}>{user.role || 'customer'}</span>
                    </p>
                </div>
                <div className="user-controls-right">
                    <button
                        onClick={handleToggleRestriction}
                        className={`restriction-button ${user.isRestricted ? 'unrestrict-btn' : 'restrict-btn'}`}
                        disabled={isUpdating}
                    >
                        {user.isRestricted ? '✅ 이용 제한 풀기' : '🚫 이용 제한하기'}
                    </button>
                    <button
                        onClick={handleToggleAdminRole}
                        className={`restriction-button ${user.role === 'admin' ? 'unrestrict-btn' : 'restrict-btn'}`}
                        disabled={isUpdating}
                    >
                        {user.role === 'admin' ? (
                            <>
                                <User size={16} /> 관리자 권한 해제
                            </>
                        ) : (
                            <>
                                <Crown size={16} /> 관리자 권한 부여
                            </>
                        )}
                    </button>
                </div>
            </div>
            
            {/* 주문 통계 카드 */}
            <div className="order-stats-card user-info-card">
                <div className="stat-item">
                    <h4>총 주문 갯수</h4>
                    <p>{totalOrders}건</p>
                </div>
                <div className="stat-item">
                    <h4>픽업 완료 갯수</h4>
                    <p>{pickedUpOrders}건</p>
                </div>
                <div className="stat-item">
                    <h4>픽업율</h4>
                    <p>{pickupRate}%</p>
                </div>
            </div>

            <h3 className="order-history-title">주문 내역 ({orders.length}건)</h3>
            <div className="order-history-table-wrapper">
                {orders.length > 0 ? (
                    <table className="order-history-table">
                        <thead>
                            <tr>
                                <th>주문일자</th>
                                <th>주문 상품</th>
                                <th>상태</th>
                                <th>픽업일자</th>
                                <th className="text-right">결제 금액</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map(order => (
                                <tr key={order.id}>
                                    {/* orderDate -> createdAt */}
                                    <td>{order.createdAt instanceof Timestamp ? order.createdAt.toDate().toLocaleDateString('ko-KR') : '날짜 없음'}</td>
                                    <td>
                                        {order.items?.map(item => `${item.productName} (${item.quantity})`).join(', ') || '상품 정보 없음'}
                                    </td>
                                    <td>
                                        {/* status 값에 맞게 텍스트 수정 */}
                                        <span className={`status-badge status-${order.status.toLowerCase()}`}>
                                            {
                                                {
                                                    'RESERVED': '예약됨',
                                                    'PREPAID': '선입금',
                                                    'PICKED_UP': '픽업 완료',
                                                    'COMPLETED': '처리 완료',
                                                    'CANCELED': '취소됨',
                                                    'NO_SHOW': '노쇼'
                                                }[order.status] || '알 수 없음'
                                            }
                                        </span>
                                    </td>
                                    {/* pickupDate -> pickedUpAt */}
                                    <td>{order.pickedUpAt ? (order.pickedUpAt as Timestamp).toDate().toLocaleDateString('ko-KR') : '-'}</td>
                                    <td className="text-right">{order.totalPrice.toLocaleString()}원</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="no-data-message">주문 내역이 없습니다.</p>
                )}
            </div>
        </div>
    );
};

export default UserDetailPage;