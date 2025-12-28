// src/pages/admin/QuickCheckPage.tsx

import React, { useState, useEffect, useCallback } from 'react';
import type { UserDocument, Order } from '@/shared/types';
// [수정] getUserById를 orderService가 아닌 userService에서 가져오도록 경로를 수정합니다.
import { getAllUsersForQuickCheck, getUserById } from '@/firebase/userService';
import { getUserOrders } from '@/firebase/orderService';
import toast from 'react-hot-toast';
import CustomerFocusView from '@/components/admin/CustomerFocusView';
import UserSearchResult from '@/components/admin/UserSearchResult';
import SodomallLoader from '@/components/common/SodomallLoader';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { AnimatePresence } from 'framer-motion';
import { Search, X, Users, SearchSlash } from 'lucide-react';


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
      const phoneMatch =
        user.phoneLast4 && user.phoneLast4.endsWith(trimmedSearchTerm);
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

  // [핵심 수정 1] UI 즉시 업데이트를 담당하는 함수
  const updateFocusedUserStats = useCallback(
    (updates: { pickup?: number; noshow?: number; points?: number }) => {
      setFocusedUser((prevUser) => {
        if (!prevUser) return null;
        // 이전 상태를 기반으로 새로운 통계 값을 계산하여 즉시 UI에 반영
        return {
          ...prevUser,
          pickupCount: Math.max(
            0,
            (prevUser.pickupCount || 0) + (updates.pickup || 0),
          ),
          noShowCount: Math.max(
            0,
            (prevUser.noShowCount || 0) + (updates.noshow || 0),
          ),
          points: (prevUser.points || 0) + (updates.points || 0),
        };
      });
    },
    [],
  );

  // [핵심 수정 2] 데이터를 새로고침하는 함수
  const refreshData = useCallback(async () => {
    if (!focusedUser) return;

    try {
      // 주문 내역은 항상 최신으로 다시 불러옴
      const freshOrders = await getUserOrders(focusedUser.uid);
      setUserOrders(freshOrders);

      // 서버에서 특정 사용자 정보만 다시 가져와서 UI 상태를 업데이트
      // 이 방식은 전체 목록을 불러오는 것보다 빠르고 정확합니다.
      const freshUserFromServer = await getUserById(focusedUser.uid);
      if (freshUserFromServer) {
        setFocusedUser(freshUserFromServer);
      }
      
    } catch {
      toast.error('데이터를 새로고침하지 못했습니다.');
    } finally {
      // 로딩 상태는 변경하지 않아 부드러운 UX 제공
    }
  }, [focusedUser]); // focusedUser가 변경될 때마다 이 함수도 최신 상태를 참조

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

  const showNoResults =
    hasSearched && !isLoading && !focusedUser && disambiguation.length === 0;

  return (
    <div className="admin-page-container quick-check-page">
      <AdminPageHeader
        title="빠른 예약 확인"
        subtitle="고객명/전화번호 뒷자리로 검색 → 픽업/노쇼 처리까지 빠르게"
        priority="high"
      />

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
          <button
            type="submit"
            className="qcp-search-button"
            disabled={isLoading}
          >
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
            onStatUpdate={updateFocusedUserStats} // UI 즉시 업데이트 함수 전달
            onActionSuccess={refreshData}         // 작업 성공 후 데이터 새로고침 함수 전달
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
                  <UserSearchResult
                    key={user.uid}
                    user={user}
                    onSelect={loadAndFocusUser}
                  />
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
    </div>
  );
};

export default QuickCheckPage;