// src/pages/admin/QuickCheckPage.tsx

import React, { useState, useEffect, useCallback } from 'react';
import type { UserDocument, Order } from '@/types';
import { getAllUsersForQuickCheck } from '@/firebase/userService';
import { getUserOrders } from '@/firebase/orderService';
import toast from 'react-hot-toast';
import CustomerFocusView from '@/components/admin/CustomerFocusView';
import UserSearchResult from '@/components/admin/UserSearchResult';
import SodomallLoader from '@/components/common/SodomallLoader';
import { AnimatePresence } from 'framer-motion';
import { Search, X, Users, SearchSlash, BellRing } from 'lucide-react';
import './QuickCheckPage.css';

// ====================================================================
// 알림톡 테스트용 컴포넌트
// ====================================================================
const AlimtalkTestSender: React.FC = () => {
    const [recipientPhone, setRecipientPhone] = useState('');
    const [templateCode, setTemplateCode] = useState('ORD_CONFIRM_NOW');
    const [isLoading, setIsLoading] = useState(false);
  
    const handleSendTest = async () => {
      if (!recipientPhone) {
        toast.error('수신자 전화번호를 입력하세요.');
        return;
      }
      setIsLoading(true);
      const toastId = toast.loading('테스트 알림톡 발송 중...');

      try {
        // ✅ [핵심 수정 1] 호출하는 함수의 리전을 'asia-northeast3'로 정확하게 수정합니다.
        const functionUrl = 'https://asia-northeast3-sso-do.cloudfunctions.net/testSendAlimtalk';
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientPhone, templateCode }),
      });

        // 응답 본문이 비어있을 수 있으므로 먼저 텍스트로 읽어옵니다.
        const text = await response.text();
        const result = text ? JSON.parse(text) : {};

        if (!response.ok) {
          // 서버에서 보낸 에러 메시지(result.error)를 우선적으로 사용합니다.
          throw new Error(result.error || `서버 응답 오류: ${response.status}`);
        }

        toast.success(`[${templateCode}] 발송 요청 성공!`, { id: toastId });
        console.log('발송 성공:', result);

      } catch (error: any) {
        toast.error(`발송 실패: ${error.message}`, { id: toastId });
        console.error('발송 실패 상세:', error);
      } finally {
        setIsLoading(false);
      }
    };
  
    return (
      <div className="qcp-dev-tools">
        <h3 className="qcp-dev-tools-title"><BellRing size={16} /> 알림톡 발송 테스트 도구</h3>
        <div className="qcp-dev-tools-content">
          <input
            type="text"
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            placeholder="수신자 전화번호 ('-' 없이 입력)"
            className="qcp-dev-tools-input"
          />
          <select
            value={templateCode}
            onChange={(e) => setTemplateCode(e.target.value)}
            className="qcp-dev-tools-select"
          >
            <option value="ORD_CONFIRM_NOW">1. 즉시 픽업 예약 확정</option>
            <option value="ORD_CONFIRM_FUTURE">2. 미래 픽업 예약 확정</option>
            <option value="STANDARD_PICKUP_STAR">3. 픽업 당일 알림</option>
            <option value="PREPAYMENT_GUIDE_URG">4. 마감 임박 및 선입금 안내</option>
          </select>
          <button onClick={handleSendTest} disabled={isLoading} className="qcp-dev-tools-button">
            {isLoading ? '전송중...' : '테스트 발송'}
          </button>
        </div>
      </div>
    );
  };


// ====================================================================
// 기존 QuickCheckPage 컴포넌트 (변경 없음)
// ====================================================================
const QuickCheckPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [focusedUser, setFocusedUser] = useState<UserDocument | null>(null);
    const [userOrders, setUserOrders] = useState<Order[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [disambiguation, setDisambiguation] = useState<UserDocument[]>([]);
    const [allUsers, setAllUsers] = useState<UserDocument[]>([]);

    useEffect(() => {
        const fetchAllUsers = async () => {
            try {
                const users = await getAllUsersForQuickCheck();
                setAllUsers(users);
            } catch (error) {
                toast.error("전체 사용자 목록을 불러오는 데 실패했습니다.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchAllUsers();
    }, []);

    const handleSearch = (e?: React.FormEvent<HTMLFormElement>) => {
        e?.preventDefault();
        const trimmedSearchTerm = searchTerm.trim();
        if (trimmedSearchTerm.length < 2) {
            toast.error('검색어는 2자 이상 입력해주세요.');
            return;
        }

        setIsLoading(true);
        setHasSearched(true);
        setFocusedUser(null);
        setDisambiguation([]);
        setUserOrders([]);

        const filteredUsers = allUsers.filter(user => {
            const term = trimmedSearchTerm.toLowerCase();
            const nameMatch = user.displayName?.toLowerCase().includes(term);
            const phoneMatch = user.phoneLast4 && user.phoneLast4.endsWith(trimmedSearchTerm);
            return nameMatch || phoneMatch;
        });
        
        if (filteredUsers.length === 0) {
            // 결과 없음
        } else if (filteredUsers.length === 1) {
            loadAndFocusUser(filteredUsers[0]);
        } else {
            setDisambiguation(filteredUsers);
        }
        
        setTimeout(() => setIsLoading(false), 200);
    };

    const loadAndFocusUser = useCallback(async (user: UserDocument) => {
        setIsLoading(true);
        setDisambiguation([]);
        setFocusedUser(user);
        try {
            const orders = await getUserOrders(user.uid);
            setUserOrders(orders);
        } catch (error) {
            toast.error("사용자의 주문 내역을 불러오지 못했습니다.");
            setUserOrders([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const updateFocusedUserStats = useCallback((updates: { pickup?: number; noshow?: number; points?: number }) => {
        setFocusedUser(prevUser => {
            if (!prevUser) return null;
            return {
                ...prevUser,
                pickupCount: Math.max(0, (prevUser.pickupCount || 0) + (updates.pickup || 0)),
                noShowCount: Math.max(0, (prevUser.noShowCount || 0) + (updates.noshow || 0)),
                points: (prevUser.points || 0) + (updates.points || 0),
            };
        });
    }, []);

    const refreshData = useCallback(async () => {
        if (focusedUser) {
            setIsLoading(true);
            try {
                const freshOrders = await getUserOrders(focusedUser.uid);
                setUserOrders(freshOrders);
                
                const freshAllUsers = await getAllUsersForQuickCheck();
                setAllUsers(freshAllUsers);
                // ✅ [수정] 'u' 파라미터에 명시적으로 타입 지정
                const freshUser = freshAllUsers.find((u: UserDocument) => u.uid === focusedUser.uid);
                if (freshUser) setFocusedUser(freshUser);

            } catch (error) {
                toast.error('데이터를 새로고침하지 못했습니다.');
            } finally {
                setIsLoading(false);
            }
        }
    }, [focusedUser]);

    const clearFocus = () => {
        setFocusedUser(null);
        setUserOrders([]);
    };
    
    const handleClearSearch = () => {
        setSearchTerm('');
        setHasSearched(false);
        setDisambiguation([]);
        setFocusedUser(null);
        setUserOrders([]);
    };

    useEffect(() => {
        if(disambiguation.length > 0) {
            setFocusedUser(null);
        }
    }, [disambiguation]);

    const showNoResults = hasSearched && !isLoading && !focusedUser && disambiguation.length === 0;

    return (
        <div className="quick-check-page">
            <header className="qcp-header">
                <h1>빠른 예약 확인</h1>
            </header>
            
            <div className="qcp-search-container">
                <form onSubmit={handleSearch} className="qcp-search-form">
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
                                onClick={handleClearSearch}
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
                {isLoading && <SodomallLoader message="사용자 목록을 불러오는 중..." />}
                
                {!isLoading && focusedUser && (
                    <CustomerFocusView 
                        user={focusedUser}
                        orders={userOrders}
                        onBack={clearFocus}
                        onStatUpdate={updateFocusedUserStats}
                        onActionSuccess={refreshData}
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
                        ) : showNoResults ? (
                             <div className="qcp-initial-prompt">
                                <SearchSlash size={48} className="prompt-icon"/>
                                <p>'{searchTerm}'에 대한 검색 결과가 없습니다.<br/>이름 또는 전화번호를 다시 확인해주세요.</p>
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
            
            {/* 페이지 최하단에 테스트 컴포넌트 렌더링 */}
            <AlimtalkTestSender />
        </div>
    );
};

export default QuickCheckPage;