// src/pages/customer/ReviewEventPage.tsx

import React, { useState, useEffect } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getFeaturedReviews, getReviewsByEventMonth, getReviewStats } from '@/firebase/reviewService';
import type { Review, ReviewStats } from '@/shared/types';
import { Star, TrendingUp, Users, Award } from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import dayjs from 'dayjs';
import './ReviewEventPage.css';

const ReviewEventPage: React.FC = () => {
  useDocumentTitle('리뷰 이벤트');
  const [featuredReviews, setFeaturedReviews] = useState<Review[]>([]);
  const [eventMonth, setEventMonth] = useState(dayjs().format('YYYY-MM'));
  const [eventReviews, setEventReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [eventMonth]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [featured, event, statsData] = await Promise.all([
        getFeaturedReviews(10),
        getReviewsByEventMonth(eventMonth),
        getReviewStats(eventMonth),
      ]);
      setFeaturedReviews(featured);
      setEventReviews(event);
      setStats(statsData);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <SodomallLoader />;

  return (
    <div className="customer-page-container modern-list-page">
      <div className="review-event-content">
      <div className="review-event-header">
        <div className="event-banner-hall-of-fame">
          <div className="banner-crown">👑</div>
          <h1 className="banner-title">리뷰 명예의 전당</h1>
          <p className="event-subtitle">소도몰 고객님들의 진솔한 후기</p>
          <div className="banner-description">
            <p className="banner-desc-text">고객님들의 리뷰가 <strong>소도몰</strong>을 만듭니다</p>
            <p className="banner-desc-text">함께 만들어가는 송도픽, 여러분의 소중한 이야기가 우리의 힘이 됩니다</p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="review-stats-section">
          <h2>이번 달 통계</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <Users size={24} />
              </div>
              <div className="stat-value">{stats.thisMonthReviews}</div>
              <div className="stat-label">이번 달 리뷰</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <Star size={24} />
              </div>
              <div className="stat-value">
                {stats.averageRating ? stats.averageRating.toFixed(1) : '-'}
              </div>
              <div className="stat-label">평균 평점</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <Award size={24} />
              </div>
              <div className="stat-value">{stats.featuredReviews}</div>
              <div className="stat-label">베스트 리뷰</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <TrendingUp size={24} />
              </div>
              <div className="stat-value">{stats.totalReviews}</div>
              <div className="stat-label">전체 리뷰</div>
            </div>
          </div>
        </div>
      )}

      {stats && stats.topReviewers.length > 0 && (
        <div className="top-reviewers-section">
          <h2>🏆 리뷰 랭킹</h2>
          <div className="rankings-list">
            {stats.topReviewers.map((reviewer, index) => (
              <div key={reviewer.key} className={`ranking-item ${index < 3 ? 'top-three' : ''}`}>
                <div className="rank-number">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </div>
                <div className="rank-info">
                  <div className="rank-name">{reviewer.name}</div>
                  <div className="rank-details">
                    <span>{reviewer.reviewCount}개 리뷰</span>
                    <span className="rank-points">크래커 지급완료 {reviewer.rewardFulfilledCount}회</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="reviews-section">
        <div className="section-header">
          <h2>⭐ 베스트 리뷰</h2>
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

        {featuredReviews.length === 0 ? (
          <div className="empty-state">
            <p>베스트 리뷰가 없습니다.</p>
          </div>
        ) : (
          <div className="reviews-grid">
            {featuredReviews.map((review) => (
              <div key={review.id} className="review-card featured">
                <div className="review-header">
                  <div className="review-author">
                    <span className="author-name">{review.userName || review.userNickname || '익명'}</span>
                    {review.isFromKakao && <span className="kakao-badge">카카오톡</span>}
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
                <div className="review-content">{review.content}</div>
                {review.images && review.images.length > 0 && (
                  <div className="review-images">
                    {review.images.map((img, idx) => (
                      <img key={idx} src={img} alt={`리뷰 이미지 ${idx + 1}`} />
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
        )}
      </div>

      {eventReviews.length > 0 && (
        <div className="reviews-section">
          <h2>이번 달 리뷰 ({eventMonth})</h2>
          <div className="reviews-grid">
            {eventReviews.map((review) => (
              <div key={review.id} className="review-card">
                <div className="review-header">
                  <div className="review-author">
                    <span className="author-name">{review.userName || review.userNickname || '익명'}</span>
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
                <div className="review-content">{review.content}</div>
                {review.images && review.images.length > 0 && (
                  <div className="review-images">
                    {review.images.map((img, idx) => (
                      <img key={idx} src={img} alt={`리뷰 이미지 ${idx + 1}`} />
                    ))}
                  </div>
                )}
                <div className="review-footer">
                  <span className="review-date">
                    {dayjs(review.createdAt instanceof Date ? review.createdAt : (review.createdAt as any)?.toDate?.() || new Date()).format('YYYY.MM.DD')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default ReviewEventPage;

