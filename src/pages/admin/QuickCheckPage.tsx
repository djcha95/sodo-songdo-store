// src/pages/admin/QuickCheckPage.tsx

import React, { useState, useRef } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { searchOrdersUnified } from '../../firebase/orderService';
import type { Order, UserDocument } from '../../types';
import { Search, Phone, Loader, X as ClearIcon, Users } from 'lucide-react'; // Users 아이콘 추가
import toast from 'react-hot-toast';
import CustomerFocusView from '@/components/admin/CustomerFocusView';
import './QuickCheckPage.css'; // 수정된 CSS 파일을 import

const QuickCheckPage: React.FC = () => {
    useDocumentTitle('빠른 예약확인');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [rawSearchResults, setRawSearchResults] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false); // 검색을 시도했는지 여부
    const [disambiguation, setDisambiguation] = useState<{ name: string; userId: string }[]>([]);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [focusedUser, setFocusedUser] = useState<UserDocument | null>(null);

    const refreshData = async () => {
        setIsLoading(true);
        if (focusedUser) {
            try {
                const userRef = doc(db, 'users', focusedUser.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    setFocusedUser({ uid: userSnap.id, ...userSnap.data() } as UserDocument);
                }

                if (!focusedUser.phone) {
                    toast.error("고객의 전화번호 정보가 없어 새로고침할 수 없습니다.");
                    setIsLoading(false);
                    return;
                }
                
                const results = await searchOrdersUnified(focusedUser.phone.slice(-4));
                setRawSearchResults(results);
            } catch (error) {
                toast.error("정보 새로고침에 실패했습니다.");
                setFocusedUser(null);
            }
        } else if (searchTerm.trim().length >= 2) {
            await handleSearch();
        }
        setIsLoading(false);
    };

    const clearAllStates = () => {
        setSearchTerm('');
        setRawSearchResults([]);
        setDisambiguation([]);
        setFocusedUser(null);
        setHasSearched(false); // 검색 시도 상태 초기화
        searchInputRef.current?.focus();
    };

    const handleSearch = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (searchTerm.trim().length < 2) {
            toast.error('검색어를 2자 이상 입력해주세요.');
            return;
        }
        setIsLoading(true);
        setHasSearched(true); // 검색 시도
        setRawSearchResults([]);
        setDisambiguation([]);
        setFocusedUser(null);
        
        try {
            const results = await searchOrdersUnified(searchTerm.trim());
            setRawSearchResults(results);

            if (results.length === 0) {
                toast('검색 결과가 없습니다.', { icon: '🔍' });
                searchInputRef.current?.select();
            } else {
                const uniqueUsers = Array.from(new Map(results.map(order => 
                    [order.userId, { name: order.customerInfo.name, userId: order.userId }]
                )).values());

                if (uniqueUsers.length > 1) {
                    setDisambiguation(uniqueUsers.sort((a,b) => a.name.localeCompare(b.name)));
                } else {
                    const targetUser = uniqueUsers[0];
                    await loadAndFocusUser(targetUser.userId);
                }
            }
        } catch (error) {
            toast.error('주문 검색 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const loadAndFocusUser = async (userId: string) => {
        setIsLoading(true);
        try {
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);
            if(userSnap.exists()) {
                setFocusedUser({ uid: userSnap.id, ...userSnap.data() } as UserDocument);
            } else {
                toast.error("선택한 고객의 상세 정보를 불러오는 데 실패했습니다.");
            }
        } catch(error) {
            toast.error("고객 정보 로딩 중 오류 발생");
        } finally {
            setIsLoading(false);
        }
    }


    if (focusedUser) {
        const ordersForFocusedUser = rawSearchResults.filter(o => o.userId === focusedUser.uid);
        
        return (
            <CustomerFocusView 
                user={focusedUser}
                orders={ordersForFocusedUser}
                onBack={clearAllStates}
                onActionComplete={refreshData}
            />
        );
    }

    return (
        <div className="quick-check-page">
            <header className="qcp-header"><h1>빠른 예약 확인</h1></header>
            <div className="qcp-search-container">
                <form onSubmit={handleSearch} className="qcp-search-form">
                    <div className="qcp-input-wrapper">
                        <Phone className="qcp-input-icon" size={20} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="고객 이름 또는 전화번호 뒷자리"
                            className="qcp-input"
                            disabled={isLoading}
                        />
                        {searchTerm && <ClearIcon className="qcp-clear-icon" size={20} onClick={clearAllStates} />}
                    </div>
                    <button type="submit" className="qcp-search-button" disabled={isLoading}>
                        {isLoading ? <Loader size={20} className="spin" /> : <Search size={20} />}
                        <span>조회</span>
                    </button>
                </form>
            </div>
            
            {disambiguation.length > 0 && !focusedUser && (
                <div className="qcp-name-selector">
                    <h4>📞 동일한 번호로 여러 고객이 검색되었습니다.</h4>
                    <div className="qcp-name-buttons">
                        {disambiguation.map(({name, userId}) => (
                            <button key={userId} onClick={() => loadAndFocusUser(userId)} disabled={isLoading}>
                                {name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {/* ✅ [디자인 개선] 로딩 중이 아닐 때, 그리고 아직 검색하지 않았을 때 안내 메시지 표시 */}
            {!isLoading && !hasSearched && (
                 <div className="qcp-initial-prompt">
                    <Users className="prompt-icon" />
                    <p>고객 이름 또는 전화번호 뒷자리를 검색하여<br/>픽업 카드 및 고객 정보를 조회하세요.</p>
                </div>
            )}
            
            {isLoading && (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <Loader size={30} className="spin" />
                </div>
            )}
        </div>
    );
};

export default QuickCheckPage;