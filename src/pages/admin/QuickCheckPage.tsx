// src/pages/admin/QuickCheckPage.tsx

import React, { useState, useEffect, useCallback } from 'react';
import type { UserDocument, Order } from '@/types';
import { searchUsers } from '@/firebase/userService';
import { getUserOrders } from '@/firebase/orderService';
import toast from 'react-hot-toast';
import UserSearchResult from '@/components/admin/UserSearchResult';
import CustomerFocusView from '@/components/admin/CustomerFocusView';
import SodomallLoader from '@/components/common/SodomallLoader';
import { AnimatePresence } from 'framer-motion';
// ✅ [UI 개선] Search, X, Users 아이콘을 import 합니다.
import { Search, X, Users } from 'lucide-react';
import './QuickCheckPage.css';

const QuickCheckPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [focusedUser, setFocusedUser] = useState<UserDocument | null>(null);
    const [userOrders, setUserOrders] = useState<Order[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [disambiguation, setDisambiguation] = useState<UserDocument[]>([]);

    const handleSearch = async (e?: React.FormEvent<HTMLFormElement>) => {
        e?.preventDefault();
        if (searchTerm.trim().length < 2) {
            toast.error('검색어는 2자 이상 입력해주세요.');
            return;
        }
        setIsLoading(true);
        setHasSearched(true);
        setFocusedUser(null);
        setDisambiguation([]);
        try {
            const users = await searchUsers(searchTerm.trim());
            if (users.length === 0) {
                toast('검색 결과가 없습니다.', { icon: '🤷' });
            } else if (users.length === 1) {
                loadAndFocusUser(users[0]);
            } else {
                const exactMatches = users.filter(u => u.displayName === searchTerm.trim() || u.phone?.slice(-4) === searchTerm.trim());
                if(exactMatches.length === 1) {
                    loadAndFocusUser(exactMatches[0]);
                } else {
                    setDisambiguation(users);
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '검색 중 오류가 발생했습니다.';
            toast.error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const loadAndFocusUser = useCallback(async (user: UserDocument) => {
        setIsLoading(true);
        setDisambiguation([]);
        try {
            const orders = await getUserOrders(user.uid);
            setFocusedUser(user);
            setUserOrders(orders);
        } catch (error) {
            toast.error('사용자 주문 정보를 불러오는 데 실패했습니다.');
            setFocusedUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refreshData = useCallback(async () => {
        if (focusedUser) {
            await loadAndFocusUser(focusedUser);
        }
    }, [focusedUser, loadAndFocusUser]);

    const onActionComplete = (revertedOrder?: Order) => {
        if (revertedOrder && focusedUser) {
            if (revertedOrder.status === 'PICKED_UP') {
                setFocusedUser(prev => prev ? { ...prev, pickupCount: Math.max(0, prev.pickupCount - 1) } : null);
            } else if (revertedOrder.status === 'NO_SHOW') {
                setFocusedUser(prev => prev ? { ...prev, noShowCount: Math.max(0, prev.noShowCount - 1) } : null);
            }
        }
        refreshData();
    };

    const clearFocus = () => {
        setFocusedUser(null);
        setUserOrders([]);
    };

    useEffect(() => {
        if(disambiguation.length > 0) {
            setFocusedUser(null);
        }
    }, [disambiguation]);

    return (
        <div className="quick-check-page">
            <header className="qcp-header">
                <h1>빠른 예약 확인</h1>
            </header>
            
            <div className="qcp-search-container">
                <form onSubmit={handleSearch} className="qcp-search-form">
                    {/* ✅ [UI 개선] 아이콘과 삭제 버튼이 포함된 입력창 구조로 변경 */}
                    <div className="qcp-input-wrapper">
                        <Search className="qcp-input-icon" size={18} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="고객 이름 또는 전화번호 뒷 4자리"
                            className="qcp-input"
                        />
                        {searchTerm && (
                            <X 
                                className="qcp-clear-icon" 
                                size={18} 
                                onClick={() => setSearchTerm('')}
                            />
                        )}
                    </div>
                    <button type="submit" className="qcp-search-button" disabled={isLoading}>
                        <Search size={16} />
                        <span>검색</span>
                    </button>
                </form>
            </div>

            <AnimatePresence mode="wait">
                {isLoading && <SodomallLoader />}
                
                {!isLoading && focusedUser && (
                    <CustomerFocusView 
                        user={focusedUser}
                        orders={userOrders}
                        onBack={clearFocus}
                        onActionComplete={onActionComplete}
                    />
                )}

                {!isLoading && !focusedUser && (
                    <div className="qcp-results-container">
                        {disambiguation.length > 0 ? (
                            <div className="disambiguation-box">
                                <h3><Users size={16} />여러분이 검색되었습니다. 선택해주세요.</h3>
                                {disambiguation.map(user => (
                                    <UserSearchResult key={user.uid} user={user} onSelect={loadAndFocusUser} />
                                ))}
                            </div>
                        ) : (
                            !hasSearched && (
                                <div className="qcp-initial-prompt">
                                    <Users size={48} className="prompt-icon"/>
                                    <p>고객의 이름 또는 전화번호 뒷 4자리를 검색하여<br/>예약 내역을 빠르게 확인하고 처리하세요.</p>
                                </div>
                            )
                        )}
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default QuickCheckPage;