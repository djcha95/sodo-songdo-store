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
import { Search, X, Users, SearchSlash } from 'lucide-react';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import './QuickCheckPage.css';

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
      } catch {
        toast.error('전체 사용자 목록을 불러오는 데 실패했습니다.');
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

    const filteredUsers = allUsers.filter((user) => {
      const term = trimmedSearchTerm.toLowerCase();
      const nameMatch = user.displayName?.toLowerCase().includes(term);
      const phoneMatch = user.phoneLast4 && user.phoneLast4.endsWith(trimmedSearchTerm);
      return nameMatch || phoneMatch;
    });

    if (filteredUsers.length === 0) {
      // no-op
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
    } catch {
      toast.error('사용자의 주문 내역을 불러오지 못했습니다.');
      setUserOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateFocusedUserStats = useCallback((updates: { pickup?: number; noshow?: number; points?: number }) => {
    setFocusedUser((prevUser) => {
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
        const freshUser = freshAllUsers.find((u: UserDocument) => u.uid === focusedUser.uid);
        if (freshUser) setFocusedUser(freshUser);
      } catch {
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
    if (disambiguation.length > 0) setFocusedUser(null);
  }, [disambiguation]);

  const showNoResults = hasSearched && !isLoading && !focusedUser && disambiguation.length === 0;

  // =========================
  // 🍪 랜덤 지급 실행
  // =========================
  const handleGrantSnackPack = async () => {
    try {
      const functions = getFunctions(getApp(), 'asia-northeast3');
      const fn = httpsCallable(functions, 'grantSnackPackToEligibleUsers');
      const toastId = toast.loading('간식 꾸러미 지급 처리 중…');
      const res: any = await fn({});
      toast.success(`생성: ${res?.data?.createdCount ?? 0}명 / 스킵: ${res?.data?.skippedCount ?? 0}명`, { id: toastId });
      console.log('grantSnackPack result:', res?.data);
    } catch (err: any) {
      toast.error(err?.message || '실행 실패');
      console.error(err);
    }
  };

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
            {searchTerm && <X className="qcp-clear-icon" size={18} onClick={handleClearSearch} />}
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
                <h3>
                  <Users size={16} />
                  여러분이 검색되었습니다. 선택해주세요.
                </h3>
                {disambiguation.map((user) => (
                  <UserSearchResult key={user.uid} user={user} onSelect={loadAndFocusUser} />
                ))}
              </div>
            ) : showNoResults ? (
              <div className="qcp-initial-prompt">
                <SearchSlash size={48} className="prompt-icon" />
                <p>
                  '{searchTerm}'에 대한 검색 결과가 없습니다.
                  <br />
                  이름 또는 전화번호를 다시 확인해주세요.
                </p>
              </div>
            ) : (
              !hasSearched && (
                <div className="qcp-initial-prompt">
                  <Users size={48} className="prompt-icon" />
                  <p>
                    고객의 이름 또는 전화번호 뒷 4자리를 검색하여
                    <br />
                    예약 내역을 빠르게 확인하고 처리하세요.
                  </p>
                </div>
              )
            )}
          </div>
        )}
      </AnimatePresence>

      {/* 관리자 전용 실행 버튼 */}
      {!isLoading && (
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button onClick={handleGrantSnackPack} className="common-button button-primary">
            🍪 랜덤 간식 지급 실행
          </button>
        </div>
      )}
    </div>
  );
};

export default QuickCheckPage;
