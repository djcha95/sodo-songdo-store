// src/pages/admin/ReviewManagementPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getAllReviews, addReview, updateReview, deleteReview, toggleFeaturedReview, updateReview as updateReviewInService } from '@/firebase/reviewService';
import { getAllProducts } from '@/firebase';
import { Timestamp } from 'firebase/firestore';
import type { Review, Product } from '@/shared/types';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Star, Image as ImageIcon, Search, Filter, X, Gift } from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import ConfirmModal from '@/components/admin/ConfirmModal';
import './ReviewManagementPage.css';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';

const ReviewManagementPage: React.FC = () => {
  useDocumentTitle('리뷰 관리');
  const [searchParams, setSearchParams] = useSearchParams();
  const filterUserId = searchParams.get('userId') || '';
  const [reviews, setReviews] = useState<Review[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFeatured, setFilterFeatured] = useState<boolean | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; userName: string } | null>(null);

  // 폼 상태
  const [formData, setFormData] = useState({
    productId: '',
    productName: '',
    userName: '',
    userNickname: '',
    content: '',
    rating: 5,
    isFromKakao: true,
    isFeatured: false,
    eventMonth: dayjs().format('YYYY-MM'),
    images: [] as File[],
  });

  useEffect(() => {
    fetchData();
  }, [filterUserId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [reviewsData, productsData] = await Promise.all([
        getAllReviews().catch((error) => {
          console.error('리뷰 데이터 로드 실패:', error);
          // 권한 오류인 경우 빈 배열 반환
          if (error.code === 'permission-denied') {
            toast.error('리뷰 데이터에 접근할 권한이 없습니다. 관리자 권한을 확인해주세요.');
            return [];
          }
          throw error;
        }),
        getAllProducts().catch((error) => {
          console.error('상품 데이터 로드 실패:', error);
          return [];
        }),
      ]);
      setReviews(reviewsData);
      setProducts(productsData);
    } catch (error: any) {
      console.error('데이터 로드 실패:', error);
      if (error.code !== 'permission-denied') {
        toast.error('데이터를 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredReviews = useMemo(() => reviews.filter((review) => {
    const matchesSearch =
      review.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.productName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFeatured = filterFeatured === null || review.isFeatured === filterFeatured;
    const matchesUser = !filterUserId || review.userId === filterUserId;
    return matchesSearch && matchesFeatured && matchesUser;
  }), [reviews, searchTerm, filterFeatured, filterUserId]);

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
      setFormData((prev) => ({ ...prev, images: [...prev.images, ...files] }));
      toast.success(`이미지 ${files.length}장 추가됨`);
    }
  };

  const handleAddReview = async () => {
    // ✅ 이미지가 있으면 내용은 선택사항
    if (!formData.content.trim() && formData.images.length === 0) {
      toast.error('리뷰 내용 또는 이미지를 입력해주세요.');
      return;
    }

    try {
      const selectedProduct = products.find((p) => p.id === formData.productId);
      await addReview(
        {
          productId: formData.productId || null,
          productName: selectedProduct?.groupName || formData.productName,
          userName: formData.userName,
          userNickname: formData.userNickname,
          content: formData.content,
          rating: formData.rating,
          isFromKakao: formData.isFromKakao,
          isFeatured: formData.isFeatured,
          eventMonth: formData.eventMonth,
        },
        formData.images.length > 0 ? formData.images : undefined
      );
      toast.success('리뷰가 등록되었습니다.');
      setShowAddModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('리뷰 등록 실패:', error);
      toast.error('리뷰 등록에 실패했습니다.');
    }
  };

  const handleUpdateReview = async () => {
    if (!editingReview || !formData.content.trim()) {
      toast.error('리뷰 내용을 입력해주세요.');
      return;
    }

    try {
      const selectedProduct = products.find((p) => p.id === formData.productId);
      await updateReview(
        editingReview.id,
        {
          productId: formData.productId || null,
          productName: selectedProduct?.groupName || formData.productName,
          userName: formData.userName,
          userNickname: formData.userNickname,
          content: formData.content,
          rating: formData.rating,
          isFeatured: formData.isFeatured,
        },
        formData.images.length > 0 ? formData.images : undefined
      );
      toast.success('리뷰가 수정되었습니다.');
      setEditingReview(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error('리뷰 수정 실패:', error);
      toast.error('리뷰 수정에 실패했습니다.');
    }
  };

  const handleDeleteReview = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteReview(deleteConfirm.id);
      toast.success('리뷰가 삭제되었습니다.');
      setDeleteConfirm(null);
      fetchData();
    } catch (error) {
      console.error('리뷰 삭제 실패:', error);
      toast.error('리뷰 삭제에 실패했습니다.');
    }
  };

  const handleToggleFeatured = async (reviewId: string, currentStatus: boolean) => {
    try {
      await toggleFeaturedReview(reviewId, !currentStatus);
      toast.success(currentStatus ? '베스트 리뷰에서 제거되었습니다.' : '베스트 리뷰로 설정되었습니다.');
      fetchData();
    } catch (error) {
      console.error('베스트 리뷰 설정 실패:', error);
      toast.error('베스트 리뷰 설정에 실패했습니다.');
    }
  };

  const handleMarkRewardFulfilled = async (review: Review) => {
    try {
      if (review.rewardStatus === 'FULFILLED') {
        toast.error('이미 지급 완료 처리된 리뷰입니다.');
        return;
      }

      await updateReviewInService(review.id, {
        rewardType: 'CRACKER_7500',
        rewardValueKrw: 7500,
        rewardStatus: 'FULFILLED',
        rewardFulfilledAt: Timestamp.now(),
      });

      toast.success('크래커 지급 완료로 처리했습니다.');
      fetchData();
    } catch (error) {
      console.error('보상 처리 실패:', error);
      toast.error('보상 처리에 실패했습니다.');
    }
  };

  const resetForm = () => {
    setFormData({
      productId: '',
      productName: '',
      userName: '',
      userNickname: '',
      content: '',
      rating: 5,
      isFromKakao: true,
      isFeatured: false,
      eventMonth: dayjs().format('YYYY-MM'),
      images: [],
    });
  };

  const openEditModal = (review: Review) => {
    setEditingReview(review);
    setFormData({
      productId: review.productId || '',
      productName: review.productName || '',
      userName: review.userName || '',
      userNickname: review.userNickname || '',
      content: review.content,
      rating: review.rating || 5,
      isFromKakao: review.isFromKakao || false,
      isFeatured: review.isFeatured || false,
      eventMonth: review.eventMonth || dayjs().format('YYYY-MM'),
      images: [],
    });
    setShowAddModal(true);
  };

  if (loading) return <SodomallLoader />;

  return (
    <div className="admin-page-container review-management-page">
      <AdminPageHeader
        title="리뷰 관리"
        subtitle={filterUserId ? `고객 리뷰 관리 (${filteredReviews.length}개)` : "카카오톡에서 받은 리뷰를 등록하고 관리하세요"}
        priority="high"
      />

      <div className="review-management-toolbar">
        <div className="review-search-filter">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="리뷰 내용, 작성자, 상품명으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-buttons">
            <button
              className={filterFeatured === null ? 'active' : ''}
              onClick={() => setFilterFeatured(null)}
            >
              전체
            </button>
            <button
              className={filterFeatured === true ? 'active' : ''}
              onClick={() => setFilterFeatured(true)}
            >
              베스트 리뷰
            </button>
            <button
              className={filterFeatured === false ? 'active' : ''}
              onClick={() => setFilterFeatured(false)}
            >
              일반 리뷰
            </button>
          </div>
        </div>
        <button className="common-button button-primary" onClick={() => { resetForm(); setShowAddModal(true); }}>
          <Plus size={16} />
          리뷰 등록
        </button>
      </div>

      {filterUserId && (
        <div className="review-filter-chip">
          <span>필터: userId = {filterUserId}</span>
          <button
            type="button"
            className="review-filter-clear"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('userId');
              setSearchParams(next, { replace: true } as any);
            }}
          >
            <X size={14} />
            필터 해제
          </button>
        </div>
      )}

      <div className="review-list">
        {filteredReviews.length === 0 ? (
          <div className="empty-state">
            <p>등록된 리뷰가 없습니다.</p>
          </div>
        ) : (
          filteredReviews.map((review) => (
            <div key={review.id} className={`review-card ${review.isFeatured ? 'featured' : ''}`}>
              <div className="review-header">
                <div className="review-author">
                  <span className="author-name">{review.userName || review.userNickname || '익명'}</span>
                  {review.isFromKakao && <span className="kakao-badge">카카오톡</span>}
                  {review.isFeatured && <span className="featured-badge">⭐ 베스트</span>}
                </div>
                <div className="review-actions">
                  {(review.rewardStatus ?? 'PENDING') !== 'FULFILLED' && (
                    <button
                      className="icon-button success"
                      onClick={() => handleMarkRewardFulfilled(review)}
                      title="크래커(7,500원 상당) 지급 완료 처리"
                    >
                      <Gift size={16} />
                    </button>
                  )}
                  {review.rewardStatus === 'FULFILLED' && (
                    <span className="reward-fulfilled-badge" title="크래커 지급 완료">
                      ✓ 지급완료
                    </span>
                  )}
                  <button
                    className="icon-button"
                    onClick={() => handleToggleFeatured(review.id, review.isFeatured || false)}
                    title={review.isFeatured ? '베스트 해제' : '베스트 설정'}
                  >
                    <Star size={16} fill={review.isFeatured ? '#FFD700' : 'none'} />
                  </button>
                  <button className="icon-button" onClick={() => openEditModal(review)}>
                    <Edit size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={() => setDeleteConfirm({ id: review.id, userName: review.userName || '익명' })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {review.productName && (
                <div className="review-product">
                  상품: {review.productName}
                </div>
              )}
              {review.rating && (
                <div className="review-rating">
                  {'⭐'.repeat(review.rating)}
                </div>
              )}
              <div className="review-content">{review.content}</div>
              {(() => {
                // ✅ images가 배열인지 확인하고 안전하게 처리
                const images = Array.isArray(review.images) ? review.images : [];
                return images.length > 0 ? (
                  <div className="review-images">
                    {images.map((img, idx) => (
                      <img key={idx} src={img} alt={`리뷰 이미지 ${idx + 1}`} />
                    ))}
                  </div>
                ) : null;
              })()}
              <div className="review-footer">
                <span className="review-date">
                  {dayjs(review.createdAt instanceof Date ? review.createdAt : (review.createdAt as any)?.toDate?.() || new Date()).format('YYYY.MM.DD')}
                </span>
                {review.rewardStatus === 'FULFILLED' && (
                  <span className="review-reward">크래커 지급완료</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 리뷰 등록/수정 모달 */}
      {(showAddModal || editingReview) && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setEditingReview(null); resetForm(); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingReview ? '리뷰 수정' : '리뷰 등록'}</h2>
              <button className="icon-button" onClick={() => { setShowAddModal(false); setEditingReview(null); resetForm(); }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>상품 선택 (선택사항)</label>
                <select
                  value={formData.productId}
                  onChange={(e) => {
                    const product = products.find((p) => p.id === e.target.value);
                    setFormData({ ...formData, productId: e.target.value, productName: product?.groupName || '' });
                  }}
                >
                  <option value="">상품 없음 (랜덤 표시)</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.groupName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>작성자 이름</label>
                <input
                  type="text"
                  value={formData.userName}
                  onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                  placeholder="카카오톡에서 가져온 이름"
                />
              </div>
              <div className="form-group">
                <label>작성자 닉네임 (선택사항)</label>
                <input
                  type="text"
                  value={formData.userNickname}
                  onChange={(e) => setFormData({ ...formData, userNickname: e.target.value })}
                  placeholder="닉네임"
                />
              </div>
              <div className="form-group">
                <label>리뷰 내용 *</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="카카오톡에서 복사한 리뷰 내용을 붙여넣으세요"
                  rows={6}
                />
              </div>
              <div className="form-group">
                <label>평점</label>
                <select
                  value={formData.rating}
                  onChange={(e) => setFormData({ ...formData, rating: Number(e.target.value) })}
                >
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>
                      {'⭐'.repeat(rating)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>이벤트 월</label>
                <input
                  type="month"
                  value={formData.eventMonth}
                  onChange={(e) => setFormData({ ...formData, eventMonth: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isFromKakao}
                    onChange={(e) => setFormData({ ...formData, isFromKakao: e.target.checked })}
                  />
                  카카오톡에서 가져온 리뷰
                </label>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isFeatured}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                  />
                  베스트 리뷰로 설정
                </label>
              </div>
              <div className="form-group">
                <label>이미지 업로드 (선택사항)</label>
                <div
                  className="review-pastezone"
                  tabIndex={0}
                  onPaste={handlePasteImages}
                >
                  <div className="review-pastezone-title">캡처 후 Ctrl+V로 바로 붙여넣기</div>
                  <div className="review-pastezone-sub">Shift+Win+S → 캡처 → 여기 클릭 → Ctrl+V</div>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setFormData({ ...formData, images: files });
                  }}
                />
                {formData.images.length > 0 && (
                  <div className="image-preview">
                    {formData.images.map((file, idx) => (
                      <div key={idx} className="preview-item">
                        <img src={URL.createObjectURL(file)} alt={`미리보기 ${idx + 1}`} />
                        <button onClick={() => {
                          const newImages = formData.images.filter((_, i) => i !== idx);
                          setFormData({ ...formData, images: newImages });
                        }}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="common-button button-secondary" onClick={() => { setShowAddModal(false); setEditingReview(null); resetForm(); }}>
                취소
              </button>
              <button
                className="common-button button-primary"
                onClick={editingReview ? handleUpdateReview : handleAddReview}
              >
                {editingReview ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteConfirm && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={handleDeleteReview}
          title="리뷰 삭제"
          message={`${deleteConfirm.userName}님의 리뷰를 삭제하시겠습니까?`}
          confirmText="삭제"
          cancelText="취소"
        />
      )}
    </div>
  );
};

export default ReviewManagementPage;

