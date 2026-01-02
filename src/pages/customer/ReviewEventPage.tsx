// src/pages/customer/ReviewEventPage.tsx

import React, { useMemo, useState, useEffect } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getFeaturedReviews, getAllReviews } from '@/firebase/reviewService';
import type { Review, ReviewStats } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import dayjs from 'dayjs';
import './ReviewEventPage.css';

const normalizeEventMonth = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = dayjs(trimmed, ['YYYY-MM', 'YYYY-M', 'YYYY/MM', 'YYYY/M', 'YYYY-MM-DD', 'YYYY/M/D'], true);
  if (parsed.isValid()) return parsed.format('YYYY-MM');

  const fallback = dayjs(trimmed);
  return fallback.isValid() ? fallback.format('YYYY-MM') : undefined;
};

const toDateSafe = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  return null;
};

const getCreatedAtDate = (review: Review): Date => {
  return toDateSafe((review as any).createdAt) || new Date();
};

const getEffectiveReviewMonth = (review: Review): string => {
  const normalized = normalizeEventMonth(review.eventMonth);
  if (normalized) return normalized;
  const d = getCreatedAtDate(review);
  return dayjs(d).format('YYYY-MM');
};

const computeTopReviewers = (reviews: Review[]): ReviewStats['topReviewers'] => {
  // 상위 리뷰어 계산 (고객 페이지는 '리뷰 랭킹'만 노출)
  const reviewerMap = new Map<string, { name: string; reviewCount: number; rewardFulfilledCount: number }>();
  reviews.forEach((review) => {
    const name = review.userName || review.userNickname || '익명';
    const key = review.userId || `name:${name}`;
    const existing = reviewerMap.get(key) || { name, reviewCount: 0, rewardFulfilledCount: 0 };
    existing.reviewCount += 1;
    // rewardFulfilledCount는 관리자/내부용이지만 타입 호환을 위해 유지(표시는 안 함)
    if (review.rewardStatus === 'FULFILLED') existing.rewardFulfilledCount += 1;
    reviewerMap.set(key, existing);
  });

  return Array.from(reviewerMap.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 10);
};

const ReviewEventPage: React.FC = () => {
  useDocumentTitle('리뷰 이벤트');
  const [featuredReviews, setFeaturedReviews] = useState<Review[]>([]);
  const [eventMonth, setEventMonth] = useState(dayjs().format('YYYY-MM'));
  const [eventReviews, setEventReviews] = useState<Review[]>([]);
  const [topReviewers, setTopReviewers] = useState<ReviewStats['topReviewers']>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxReviews, setLightboxReviews] = useState<Review[]>([]);
  const [lightboxReviewIndex, setLightboxReviewIndex] = useState(0);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'prev'>('next');
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    fetchData();
  }, [eventMonth]);

  useEffect(() => {
    // 월 변경/데이터 리로드 시 "더보기" 초기화
    setVisibleCount(12);
  }, [eventMonth]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // ✅ 모든 리뷰를 가져와서 클라이언트에서 필터링 (eventMonth가 없는 이전 리뷰도 처리)
      const [featured, allReviews] = await Promise.all([
        getFeaturedReviews(100), // 충분히 많이 가져와서 필터링
        getAllReviews(), // 모든 리뷰 가져오기
      ]);
      
      // ✅ eventMonth로 필터링 (eventMonth 포맷이 깨진 데이터도 createdAt 기준으로 fallback)
      const filteredEventReviews = allReviews.filter((review) => getEffectiveReviewMonth(review) === eventMonth);
      
      // ✅ 베스트 리뷰도 동일한 방식으로 필터링
      const filteredFeatured = featured.filter((review) => getEffectiveReviewMonth(review) === eventMonth);
      
      setFeaturedReviews(filteredFeatured);
      setEventReviews(filteredEventReviews);
      setTopReviewers(computeTopReviewers(filteredEventReviews));
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 이미지가 있는 모든 리뷰를 하나의 배열로 합치기 (베스트 + 일반)
  const allReviewsWithImages = useMemo(() => {
    const combined = [...featuredReviews, ...eventReviews];
    return combined.filter((r) => Array.isArray(r.images) && r.images.length > 0);
  }, [featuredReviews, eventReviews]);

  const openLightbox = (review: Review, imageIndex: number) => {
    if (!review.images || review.images.length === 0) return;
    
    // 현재 리뷰가 allReviewsWithImages에서 몇 번째인지 찾기
    const reviewIndex = allReviewsWithImages.findIndex((r) => r.id === review.id);
    if (reviewIndex === -1) return;
    
    setLightboxReviews(allReviewsWithImages);
    setLightboxReviewIndex(reviewIndex);
    setLightboxImageIndex(Math.max(0, Math.min(imageIndex, review.images.length - 1)));
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setLightboxReviews([]);
    setLightboxReviewIndex(0);
    setLightboxImageIndex(0);
    setTouchStartX(null);
    document.body.style.overflow = '';
  };

  const currentReview = lightboxReviews[lightboxReviewIndex];
  const currentImages = currentReview?.images || [];
  const currentImage = currentImages[lightboxImageIndex];

  // 다음/이전 리뷰로 이동 (애니메이션 포함)
  const goToNextReview = () => {
    if (lightboxReviewIndex < lightboxReviews.length - 1 && !isTransitioning) {
      setTransitionDirection('next');
      setIsTransitioning(true);
      setTimeout(() => {
        setLightboxReviewIndex(lightboxReviewIndex + 1);
        setLightboxImageIndex(0);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 300);
    }
  };

  const goToPrevReview = () => {
    if (lightboxReviewIndex > 0 && !isTransitioning) {
      setTransitionDirection('prev');
      setIsTransitioning(true);
      setTimeout(() => {
        setLightboxReviewIndex(lightboxReviewIndex - 1);
        const prevReview = lightboxReviews[lightboxReviewIndex - 1];
        setLightboxImageIndex(prevReview?.images?.length ? prevReview.images.length - 1 : 0);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 300);
    }
  };

  // 다음/이전 이미지로 이동 (같은 리뷰 내, 애니메이션 포함)
  const goToNextImage = () => {
    if (isTransitioning) return;
    if (lightboxImageIndex < currentImages.length - 1) {
      setTransitionDirection('next');
      setIsTransitioning(true);
      setTimeout(() => {
        setLightboxImageIndex(lightboxImageIndex + 1);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 300);
    } else {
      goToNextReview();
    }
  };

  const goToPrevImage = () => {
    if (isTransitioning) return;
    if (lightboxImageIndex > 0) {
      setTransitionDirection('prev');
      setIsTransitioning(true);
      setTimeout(() => {
        setLightboxImageIndex(lightboxImageIndex - 1);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 300);
    } else {
      goToPrevReview();
    }
  };

  // 터치 스와이프 제스처
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    const threshold = 50; // 최소 스와이프 거리

    if (Math.abs(diff) > threshold && !isTransitioning) {
      if (diff > 0) {
        // 왼쪽으로 스와이프 → 다음
        goToNextImage();
      } else {
        // 오른쪽으로 스와이프 → 이전
        goToPrevImage();
      }
    }
    setTouchStartX(null);
  };

  const photoHighlight = useMemo(() => {
    const withImages = eventReviews
      .filter((r) => Array.isArray(r.images) && r.images.length > 0)
      .slice()
      .sort((a, b) => getCreatedAtDate(b).getTime() - getCreatedAtDate(a).getTime());
    return withImages.slice(0, 10);
  }, [eventReviews]);

  const scrollToReviews = () => {
    const el = document.getElementById('reviews-section');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const pagedEventReviews = useMemo(() => eventReviews.slice(0, visibleCount), [eventReviews, visibleCount]);
  const canLoadMore = eventReviews.length > visibleCount;

  if (loading) return <SodomallLoader />;

  return (
    <div className="customer-page-container modern-list-page">
      <div className="review-event-content">
      <div className="review-event-header">
        <h1 className="page-title-glamorous">리뷰 명예의 전당</h1>
      </div>

      {photoHighlight.length > 0 && (
        <div className="photo-highlight">
          <div className="photo-highlight-header">
            <h2 className="photo-highlight-title">📸 공구 리뷰</h2>
            <div className="photo-highlight-meta">
              <span>{dayjs(eventMonth).format('YYYY년 MM월')}</span>
              <span className="dot">•</span>
              <span>{photoHighlight.length}개</span>
            </div>
          </div>
          <div className="photo-highlight-grid">
            {photoHighlight.map((review) => {
              const images = Array.isArray(review.images) ? review.images : [];
              const first = images[0];
              return (
                <button
                  key={review.id}
                  type="button"
                  className="photo-tile"
                  onClick={() => openLightbox(review, 0)}
                  title="클릭해서 크게 보기"
                >
                  <img src={first} alt="리뷰 이미지" loading="lazy" />
                  <div className="photo-tile-overlay">
                    <div className="photo-tile-top">
                      <span className="photo-tile-author">
                        {review.userName || review.userNickname || '익명'}님
                        {review.phoneLast4 && ` (${review.phoneLast4})`}
                      </span>
                    </div>
                    <div className="photo-tile-bottom">
                      <span className="photo-tile-date">
                        {dayjs(getCreatedAtDate(review)).format('MM.DD')}
                      </span>
                      {images.length > 1 && (
                        <span className="photo-tile-count">+{images.length - 1}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {topReviewers.length > 0 && (
        <div className="top-reviewers-section">
          <h2>🏆 리뷰 랭킹</h2>
          <div className="rankings-list">
            {topReviewers.map((reviewer, index) => (
              <div key={reviewer.key} className={`ranking-item ${index < 3 ? 'top-three' : ''}`}>
                <div className="rank-number">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </div>
                <div className="rank-info">
                  <div className="rank-name">{reviewer.name}님</div>
                  <div className="rank-details">
                    <span>{reviewer.reviewCount}개 리뷰</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ✅ 감사 메시지 */}
      <div className="review-appreciation">
        <div className="appreciation-icon">💝</div>
        <div className="appreciation-content">
          <h3 className="appreciation-title">리뷰해주셔서 감사합니다!</h3>
          <p className="appreciation-text">여러분의 소중한 리뷰는 공구상품 선정에 큰 도움이 됩니다</p>
        </div>
      </div>

      <div className="reviews-section">
        <div className="section-header" id="reviews-section">
          <h2>리뷰 목록</h2>
          <select
            value={eventMonth}
            onChange={(e) => setEventMonth(e.target.value)}
            className="month-selector"
          >
            {Array.from({ length: 6 }, (_, i) => {
              const month = dayjs().subtract(i, 'month').format('YYYY-MM');
              return (
                <option key={month} value={month}>
                  {dayjs(month).format('YYYY년 MM월')}
                </option>
              );
            })}
          </select>
        </div>

        {/* ✅ 베스트 리뷰만 표시 (전체 리뷰는 접기/펼치기) */}
        {featuredReviews.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: '#1e293b' }}>
              ⭐ 베스트 리뷰
            </h3>
            <div className="reviews-grid">
              {featuredReviews.map((review) => (
                  <div key={review.id} className="review-card featured">
                    <div className="review-header">
                      <div className="review-author">
                        <span className="author-name">
                          {review.userName || review.userNickname || '익명'}님
                          {review.phoneLast4 && ` (${review.phoneLast4})`}
                        </span>
                      </div>
                      {review.rating && (
                        <div className="review-rating">
                          {'⭐'.repeat(review.rating)}
                        </div>
                      )}
                    </div>
                    {review.productName && (
                      <div className="review-product">상품: {review.productName}</div>
                    )}
                    {!!review.content?.trim() && <div className="review-content">{review.content}</div>}
                    {review.images && review.images.length > 0 && (
                      <div className="review-images">
                        {review.images.map((img, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="review-image-btn"
                            onClick={() => openLightbox(review, idx)}
                            title="클릭해서 크게 보기"
                          >
                            <img src={img} alt={`리뷰 이미지 ${idx + 1}`} loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="review-footer">
                      <span className="review-date">
                        {dayjs(review.createdAt instanceof Date ? review.createdAt : (review.createdAt as any)?.toDate?.() || new Date()).format('YYYY.MM.DD')}
                      </span>
                      {review.likeCount && review.likeCount > 0 && (
                        <span className="review-likes">❤️ {review.likeCount}</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ✅ 전체 리뷰는 접기/펼치기로 */}
        {eventReviews.length > 0 && (
          <details className="all-reviews-details">
            <summary className="all-reviews-summary">
              전체 리뷰 ({eventReviews.length}개) {pagedEventReviews.length < eventReviews.length && `· 현재 ${pagedEventReviews.length}개 표시`}
            </summary>
            <div className="reviews-grid" style={{ marginTop: '1rem' }}>
              {pagedEventReviews.map((review) => (
                <div key={review.id} className={`review-card ${review.isFeatured ? 'featured' : ''}`}>
                  <div className="review-header">
                    <div className="review-author">
                      <span className="author-name">
                        {review.userName || review.userNickname || '익명'}
                        {review.phoneLast4 && ` (${review.phoneLast4})`}
                      </span>
                      {review.isFeatured && <span className="featured-badge">⭐ 베스트</span>}
                    </div>
                    {review.rating && (
                      <div className="review-rating">
                        {'⭐'.repeat(review.rating)}
                      </div>
                    )}
                  </div>
                  {review.productName && (
                    <div className="review-product">상품: {review.productName}</div>
                  )}
                  {!!review.content?.trim() && <div className="review-content">{review.content}</div>}
                  {review.images && review.images.length > 0 && (
                    <div className="review-images">
                      {review.images.map((img, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="review-image-btn"
                          onClick={() => openLightbox(review, idx)}
                          title="클릭해서 크게 보기"
                        >
                          <img src={img} alt={`리뷰 이미지 ${idx + 1}`} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="review-footer">
                    <span className="review-date">
                      {dayjs(review.createdAt instanceof Date ? review.createdAt : (review.createdAt as any)?.toDate?.() || new Date()).format('YYYY.MM.DD')}
                    </span>
                    {review.likeCount && review.likeCount > 0 && (
                      <span className="review-likes">❤️ {review.likeCount}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {canLoadMore && (
              <div className="load-more-wrap">
                <button
                  type="button"
                  className="load-more-btn"
                  onClick={() => setVisibleCount((c) => Math.min(eventReviews.length, c + 12))}
                >
                  더 보기 ({Math.min(eventReviews.length, visibleCount + 12)} / {eventReviews.length})
                </button>
              </div>
            )}
          </details>
        )}

        {eventReviews.length === 0 && (
          <div className="empty-state">
            <p>{eventMonth}에 등록된 리뷰가 없습니다.</p>
          </div>
        )}
      </div>
      </div>

      {/* ✅ 라이트박스(확대 보기) - 리뷰 단위 */}
      {lightboxOpen && currentReview && (
        <div className="review-lightbox" role="dialog" aria-modal="true" onClick={closeLightbox}>
          <div 
            className="review-lightbox-inner" 
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <button type="button" className="lightbox-close" onClick={closeLightbox} aria-label="닫기">
              ×
            </button>
            
            {/* 리뷰 정보 헤더 */}
            <div className={`lightbox-header ${isTransitioning ? 'transitioning' : ''}`}>
              <div className="lightbox-author">
                <span className="lightbox-author-name">
                  {currentReview.userName || currentReview.userNickname || '익명'}님
                  {currentReview.phoneLast4 && ` (${currentReview.phoneLast4})`}
                </span>
                {currentReview.isFeatured && <span className="featured-badge">⭐ 베스트</span>}
              </div>
              <div className="lightbox-meta">
                {currentReview.productName && (
                  <span className="lightbox-product">{currentReview.productName}</span>
                )}
                <span className="lightbox-date">
                  {dayjs(getCreatedAtDate(currentReview)).format('YYYY.MM.DD')}
                </span>
              </div>
            </div>

            {/* 이미지 영역 */}
            <div className="lightbox-stage">
              <button
                type="button"
                className="lightbox-nav prev"
                onClick={goToPrevImage}
                disabled={lightboxReviewIndex === 0 && lightboxImageIndex === 0}
                aria-label="이전"
              >
                ‹
              </button>
              <div className="lightbox-image-container">
                <div className={`lightbox-image-wrapper ${isTransitioning ? `transitioning ${transitionDirection}` : ''}`}>
                  <img
                    className="lightbox-image"
                    src={currentImage}
                    alt={`리뷰 이미지 ${lightboxImageIndex + 1}`}
                    key={`${lightboxReviewIndex}-${lightboxImageIndex}`}
                  />
                </div>
              </div>
              <button
                type="button"
                className="lightbox-nav next"
                onClick={goToNextImage}
                disabled={lightboxReviewIndex === lightboxReviews.length - 1 && lightboxImageIndex === currentImages.length - 1}
                aria-label="다음"
              >
                ›
              </button>
            </div>

            {/* 리뷰 내용 (있는 경우) */}
            {!!currentReview.content?.trim() && (
              <div className={`lightbox-content ${isTransitioning ? 'transitioning' : ''}`}>
                {currentReview.content}
              </div>
            )}

            {/* 하단 카운터 */}
            <div className="lightbox-footer">
              <span>
                {lightboxReviewIndex + 1} / {lightboxReviews.length} 리뷰
                {currentImages.length > 1 && ` · ${lightboxImageIndex + 1} / ${currentImages.length} 이미지`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewEventPage;

