// src/pages/admin/UserListPage.tsx

import { useState, useEffect, useMemo, useCallback } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle'; // ✅ [추가]
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import type { DocumentData, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Loader, ArrowUp, ArrowDown } from 'lucide-react';

import './UserListPage.css';

// 타입 정의
interface AppUser extends DocumentData {
    uid: string;
    email: string;
    displayName: string;
    role: 'admin' | 'customer';
    noShowCount?: number;
    isRestricted?: boolean;
    customerPhoneLast4?: string;
    totalOrders?: number;
    pickedUpOrders?: number;
    pickupRate?: number;
    totalPriceSum?: number;
    createdAt?: Date;
}

interface Order extends DocumentData {
    id: string;
    userId: string;
    status: 'pending' | 'picked_up' | 'cancelled';
    totalPrice: number;
    orderDate: Timestamp;
}

// 정렬 기준 타입
type SortKey = 'displayName' | 'totalOrders' | 'noShowCount' | 'createdAt' | 'pickupRate' | 'totalPriceSum';

// 로딩 스피너 컴포넌트
const LoadingSpinner = () => (
    <div className="loading-overlay">
        <Loader size={48} className="spin" />
        <p>데이터를 불러오는 중...</p>
    </div>
);

const UserListPage = () => {
    useDocumentTitle('전체 고객 관리'); // ✅ [추가]
    const [allUsers, setAllUsers] = useState<AppUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<SortKey>('createdAt');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const calculateUserStats = useCallback(async (users: AppUser[]): Promise<AppUser[]> => {
        if (users.length === 0) return [];

        const ordersQuery = query(collection(db, 'orders'));
        const ordersSnapshot = await getDocs(ordersQuery);
        
        const allOrders: Order[] = ordersSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId as string,
                status: data.status as 'pending' | 'picked_up' | 'cancelled',
                totalPrice: data.totalPrice as number,
                orderDate: data.orderDate as Timestamp,
            };
        });

        const userStatsMap = new Map<string, { totalOrders: number; pickedUpOrders: number; totalPriceSum: number }>();

        allOrders.forEach(order => {
            if (order.userId) {
                const stats = userStatsMap.get(order.userId) || { totalOrders: 0, pickedUpOrders: 0, totalPriceSum: 0 };
                stats.totalOrders += 1;
                stats.totalPriceSum += order.totalPrice || 0;
                if (order.status === 'picked_up') {
                    stats.pickedUpOrders += 1;
                }
                userStatsMap.set(order.userId, stats);
            }
        });

        const usersWithStats = users.map(user => {
            const stats = userStatsMap.get(user.uid) || { totalOrders: 0, pickedUpOrders: 0, totalPriceSum: 0 };
            const pickupRate = stats.totalOrders > 0 ? (stats.pickedUpOrders / stats.totalOrders) * 100 : 0;
            return {
                ...user,
                totalOrders: stats.totalOrders,
                pickedUpOrders: stats.pickedUpOrders,
                pickupRate: parseFloat(pickupRate.toFixed(1)),
                totalPriceSum: stats.totalPriceSum,
            };
        });
        
        return usersWithStats;
    }, []);

    useEffect(() => {
        setIsLoading(true);
        const usersQuery = query(collection(db, 'users'));
        const unsubscribe = onSnapshot(usersQuery, async (querySnapshot) => {
            const usersData = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    uid: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate()
                } as AppUser;
            });

            const usersWithStats = await calculateUserStats(usersData);
            setAllUsers(usersWithStats);
            setIsLoading(false);
        }, (error) => {
            console.error("사용자 목록 실시간 로딩 오류:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [calculateUserStats]);

    const handleSort = (key: SortKey) => {
        if (sortBy === key) {
            setSortDirection(prevDirection => (prevDirection === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(key);
            setSortDirection('desc');
        }
    };

    const filteredAndSortedUsers = useMemo(() => {
        let results = allUsers.filter(user =>
            (user.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.customerPhoneLast4 || '').includes(searchTerm)
        );

        if (sortBy) {
            results.sort((a, b) => {
                const aValue = a[sortBy] ?? (sortBy === 'createdAt' ? new Date(0) : 0);
                const bValue = b[sortBy] ?? (sortBy === 'createdAt' ? new Date(0) : 0);

                if (aValue instanceof Date && bValue instanceof Date) {
                    return sortDirection === 'asc' ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime();
                } 
                
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                }
                
                const aStr = String(aValue).toLowerCase();
                const bStr = String(bValue).toLowerCase();
                if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
                if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return results;
    }, [searchTerm, allUsers, sortBy, sortDirection]);

    const renderSortIndicator = (key: SortKey) => {
        if (sortBy !== key) return null;
        return sortDirection === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />;
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="user-list-container">
            <div className="header-container">
                <h1 className="page-title">전체 고객 관리</h1>
                <div className="controls-container">
                    <input
                        type="text"
                        placeholder="이름, 이메일, 전화번호 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>
            
            <div className="table-wrapper">
                {filteredAndSortedUsers.length > 0 ? (
                    <table className="user-list-table">
                        <thead>
                            <tr>
                                {/* [수정] th의 자식 div에 flex를 적용하여 정렬 아이콘을 표시합니다. */}
                                <th onClick={() => handleSort('displayName')} className="sortable">
                                    <div className="sortable-header">
                                        <span>이름</span>
                                        {renderSortIndicator('displayName')}
                                    </div>
                                </th>
                                <th>전화번호</th>
                                <th>이메일</th>
                                <th>권한</th>
                                <th onClick={() => handleSort('noShowCount')} className="sortable">
                                    <div className="sortable-header">
                                        <span>노쇼</span>
                                        {renderSortIndicator('noShowCount')}
                                    </div>
                                </th>
                                <th>상태</th>
                                <th onClick={() => handleSort('totalOrders')} className="sortable">
                                    <div className="sortable-header">
                                        <span>총 주문</span>
                                        {renderSortIndicator('totalOrders')}
                                    </div>
                                </th>
                                <th onClick={() => handleSort('pickupRate')} className="sortable">
                                    <div className="sortable-header">
                                        <span>픽업율</span>
                                        {renderSortIndicator('pickupRate')}
                                    </div>
                                </th>
                                <th onClick={() => handleSort('totalPriceSum')} className="sortable text-right">
                                    <div className="sortable-header">
                                        <span>총 구매 금액</span>
                                        {renderSortIndicator('totalPriceSum')}
                                    </div>
                                </th>
                                <th onClick={() => handleSort('createdAt')} className="sortable">
                                    <div className="sortable-header">
                                        <span>가입일</span>
                                        {renderSortIndicator('createdAt')}
                                    </div>
                                </th>
                                <th>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedUsers.map(user => (
                                <tr key={user.uid}>
                                    <td>{user.displayName || '이름 없음'}</td>
                                    <td>****{user.customerPhoneLast4 || '----'}</td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`user-role role-${user.role}`}>
                                            {user.role === 'admin' ? '관리자' : '고객'}
                                        </span>
                                    </td>
                                    <td className={user.noShowCount && user.noShowCount > 0 ? 'text-danger' : ''}>
                                        {user.noShowCount || 0} 회
                                    </td>
                                    <td>
                                        {user.isRestricted && <span className="status-badge restricted">이용 제한</span>}
                                    </td>
                                    <td>{user.totalOrders ?? 0} 건</td>
                                    <td>{user.pickupRate?.toFixed(1) ?? '0.0'}%</td>
                                    <td className="text-right">{user.totalPriceSum?.toLocaleString() ?? 0} 원</td>
                                    <td>{user.createdAt ? user.createdAt.toLocaleDateString('ko-KR') : '-'}</td>
                                    <td>
                                        <Link to={`/admin/users/${user.uid}`} className="manage-link">
                                            상세 보기
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="no-data-message">
                       <p>{searchTerm ? `"${searchTerm}"에 대한 검색 결과가 없습니다.` : "표시할 사용자가 없습니다."}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserListPage;