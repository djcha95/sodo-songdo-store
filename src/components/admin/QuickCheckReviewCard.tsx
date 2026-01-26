// src/components/admin/QuickCheckReviewCard.tsx

import React from 'react';
import type { Review } from '@/shared/types';
import { MessageSquare, Image as ImageIcon, Star, Gift } from 'lucide-react';
import dayjs from 'dayjs';
import './QuickCheckReviewCard.css';

interface QuickCheckReviewCardProps {
  review: Review;
  isSelected?: boolean;
  onSelect?: (reviewId: string) => void;
}

const QuickCheckReviewCard: React.FC<QuickCheckReviewCardProps> = ({ 
  review, 
  isSelected = false,
  onSelect
}) => {
  const handleClick = () => {
    if (onSelect) {
      onSelect(review.id);
    }
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return '날짜 없음';
    let date: Date;
    if (typeof timestamp.toDate === 'function') date = timestamp.toDate();
    else if (typeof timestamp.seconds === 'number') date = new Date(timestamp.seconds * 1000);
    else return '형식 오류';
    if (isNaN(date.getTime())) return '날짜 오류';
    return dayjs(date).format('YYYY.MM.DD');
  };

  const hasImages = review.images && review.images.length > 0;
  // ✅ rewardStatus가 undefined이거나 'PENDING'이면 대기중, 'FULFILLED'면 완료
  const isRewardFulfilled = review.rewardStatus === 'FULFILLED';

  return (
    <div 
      className={`qc-review-card ${isSelected ? 'selected' : ''} ${review.isFeatured ? 'featured' : ''}`}
      onClick={handleClick}
    >
      {isSelected && (
        <div className="qcr-checkmark">
          <MessageSquare size={20} />
        </div>
      )}
      
      <div className="qcr-top-row">
        <span className="qcr-date">{formatDate(review.createdAt)}</span>
        {review.isFeatured && (
          <span className="qcr-featured-badge">⭐ 베스트</span>
        )}
      </div>

      <div className="qcr-body">
        {review.productName && (
          <div className="qcr-product-name">
            {review.productName}
          </div>
        )}
        
        {review.content && (
          <div className="qcr-content">
            {review.content}
          </div>
        )}

        {hasImages && (
          <div className="qcr-images">
            <ImageIcon size={14} />
            <span>{review.images!.length}장</span>
          </div>
        )}

        {review.rating && (
          <div className="qcr-rating">
            {'⭐'.repeat(review.rating)}
          </div>
        )}
      </div>

      <div className="qcr-bottom-row">
        <div className="qcr-author">
          <span>{review.userName || review.userNickname || '익명'}</span>
          {review.isFromKakao && <span className="qcr-kakao-badge">카톡</span>}
        </div>
        <div className="qcr-reward-status">
          {isRewardFulfilled ? (
            <div className="qcr-reward-status fulfilled">
              <Gift size={14} />
              <span>사은품 증정완료</span>
            </div>
          ) : (
            <div className="qcr-reward-status pending">
              <Gift size={14} />
              <span>대기중</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(QuickCheckReviewCard);

