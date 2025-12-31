// src/pages/admin/QuickCheckPage.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { UserDocument, Order } from '@/shared/types';
// [수정] getUserById를 orderService가 아닌 userService에서 가져오도록 경로를 수정합니다.
import { getAllUsersForQuickCheck, getUserById } from '@/firebase/userService';
import { getUserOrders } from '@/firebase/orderService';
import { addReview, getReviewCountByUserId } from '@/firebase/reviewService';
import toast from 'react-hot-toast';
import CustomerFocusView from '@/components/admin/CustomerFocusView';
import UserSearchResult from '@/components/admin/UserSearchResult';
import SodomallLoader from '@/components/common/SodomallLoader';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { AnimatePresence } from 'framer-motion';
import { Search, X, Users, SearchSlash, MessageSquarePlus, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import dayjs from 'dayjs';


import './QuickCheckPage.css';

const QuickCheckPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [focusedUser, setFocusedUser] = useState<UserDocument | null>(null);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [disambiguation, setDisambiguation] = useState<UserDocument[]>([]);
  const [allUsers, setAllUsers] = useState<UserDocument[]>([]);
  const navigate = useNavigate();

  // ✅ 후기(리뷰) 상태
  const [reviewCount, setReviewCount] = useState<number>(0);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewProductHint, setReviewProductHint] = useState('');
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [rewardFulfilledNow, setRewardFulfilledNow] = useState(false);
  const reviewEventMonth = useMemo(() => dayjs().format('YYYY-MM'), []);
  
  // ✅ 보상 설정 (나중에 쉽게 변경 가능하도록 상수로 분리)
  const REVIEW_REWARD_CONFIG = {
    type: 'CRACKER_7500' as const,
    valueKrw: 7500,
    label: '크래커(7,500원 상당)',
  };

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

  // ✅ 선택된 사용자 후기 개수 로드
  useEffect(() => {
    if (!focusedUser?.uid) {
      setReviewCount(0);
      return;
    }
    let mounted = true;
    getReviewCountByUserId(focusedUser.uid)
      .then((count) => { if (mounted) setReviewCount(count); })
      .catch(() => { if (mounted) setReviewCount(0); });
    return () => { mounted = false; };
  }, [focusedUser?.uid]);

  const openReviewModal = () => {
    if (!focusedUser) return;
    setReviewProductHint('');
    setReviewImages([]);
    setRewardFulfilledNow(false);
    setIsReviewModalOpen(true);
  };

  const handlePasteImages = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type?.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      setReviewImages((prev) => [...prev, ...files]);
      toast.success(`이미지 ${files.length}장 추가됨`);
    }
  };

  const submitReview = async () => {
    if (!focusedUser) return;
    
    // ✅ 이미지가 필수 (캡처 이미지에 글과 사진이 모두 포함되어 있음)
    if (reviewImages.length === 0) {
      toast.error('캡처 이미지를 업로드해주세요.');
      return;
    }
    
    try {
      await addReview(
        {
          productId: null,
          productName: reviewProductHint.trim() ? reviewProductHint.trim() : undefined,
          userId: focusedUser.uid,
          userName: focusedUser.displayName || undefined,
          userNickname: focusedUser.nickname || undefined,
          content: '', // ✅ 이미지에 모든 내용이 포함되어 있으므로 빈 문자열
          rating: undefined,
          isFromKakao: true,
          isFeatured: false,
          eventMonth: reviewEventMonth,
          rewardType: REVIEW_REWARD_CONFIG.type,
          rewardValueKrw: REVIEW_REWARD_CONFIG.valueKrw,
          rewardStatus: rewardFulfilledNow ? 'FULFILLED' : 'PENDING',
          rewardFulfilledAt: rewardFulfilledNow ? Timestamp.now() : undefined,
        } as any,
        reviewImages
      );
      toast.success('후기가 등록되었습니다.');
      setIsReviewModalOpen(false);
      setReviewProductHint('');
      setReviewImages([]);
      setRewardFulfilledNow(false);
      // 카운트 갱신
      const count = await getReviewCountByUserId(focusedUser.uid);
      setReviewCount(count);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || '후기 등록에 실패했습니다.');
    }
  };

  const openUserReviewList = () => {
    if (!focusedUser) return;
    navigate(`/admin/reviews?userId=${focusedUser.uid}`);
  };

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
            reviewCount={reviewCount}
            onAddReview={openReviewModal}
            onOpenReviews={openUserReviewList}
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

      {/* ✅ 후기 추가 모달 (캡처 후 Ctrl+V로 이미지 붙여넣기) */}
      {isReviewModalOpen && focusedUser && (
        <div
          className="qcp-review-modal-overlay"
          onClick={() => setIsReviewModalOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                후기 추가 - {focusedUser.displayName || focusedUser.phoneLast4 || focusedUser.uid}
              </h2>
              <button className="icon-button" onClick={() => setIsReviewModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>어떤 공구 후기인지 (선택)</label>
                <input
                  type="text"
                  value={reviewProductHint}
                  onChange={(e) => setReviewProductHint(e.target.value)}
                  placeholder="예: 콤부차 / 크래커 / 딸기…"
                />
              </div>

              <div className="form-group">
                <label>캡처 이미지 붙여넣기 (Ctrl+V) *</label>
                <div
                  className="qcp-review-pastezone"
                  tabIndex={0}
                  onPaste={handlePasteImages}
                >
                  <div className="qcp-review-pastezone-title">
                    Shift+Win+S → 캡처 → 여기 클릭 → Ctrl+V
                  </div>
                  <div className="qcp-review-pastezone-sub">
                    또는 파일 선택도 가능해요.
                  </div>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) setReviewImages((prev) => [...prev, ...files]);
                  }}
                />
                {reviewImages.length > 0 && (
                  <div className="qcp-review-preview">
                    {reviewImages.map((file, idx) => (
                      <div key={idx} className="qcp-review-preview-item">
                        <img src={URL.createObjectURL(file)} alt={`리뷰 이미지 ${idx + 1}`} />
                        <button
                          type="button"
                          onClick={() => setReviewImages((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={rewardFulfilledNow}
                    onChange={(e) => setRewardFulfilledNow(e.target.checked)}
                  />
                  <Gift size={16} />
                  {REVIEW_REWARD_CONFIG.label} 지급완료로 바로 처리
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button className="common-button button-secondary" onClick={() => setIsReviewModalOpen(false)}>
                취소
              </button>
              <button className="common-button button-primary" onClick={submitReview}>
                등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickCheckPage;