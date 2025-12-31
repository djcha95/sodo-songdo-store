// src/firebase/reviewService.ts

import { db, storage } from './firebaseConfig';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import type { Review, ReviewStats } from '@/shared/types';
import { uploadImages } from './generalService';

const reviewsCollectionRef = collection(db, 'reviews');

/**
 * 홈/리스트에서 보여줄 최신 리뷰
 */
export const getRecentReviews = async (limitCount: number = 20): Promise<Review[]> => {
  const q = query(reviewsCollectionRef, orderBy('createdAt', 'desc'), limit(limitCount));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
};

/**
 * 특정 사용자 리뷰 개수 (관리자 QuickCheck용)
 */
export const getReviewCountByUserId = async (userId: string): Promise<number> => {
  if (!userId) return 0;
  const q = query(reviewsCollectionRef, where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.size;
};

/**
 * 특정 사용자 리뷰 목록 (관리자용)
 */
export const getReviewsByUserId = async (userId: string): Promise<Review[]> => {
  if (!userId) return [];
  const q = query(reviewsCollectionRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
};

/**
 * 리뷰 추가 (관리자용 - 카카오톡에서 가져온 리뷰 등록)
 */
export const addReview = async (
  reviewData: Omit<Review, 'id' | 'createdAt' | 'updatedAt'>,
  imageFiles?: File[]
): Promise<string> => {
  let imageUrls: string[] = [];

  // 이미지 업로드
  if (imageFiles && imageFiles.length > 0) {
    imageUrls = await uploadImages(imageFiles, 'reviews');
  }

  const newReview = {
    ...reviewData,
    images: imageUrls.length > 0 ? imageUrls : reviewData.images || [],
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
    likeCount: 0,
    isVerified: reviewData.isFromKakao ? true : false, // 카카오톡 리뷰는 자동 검증
  };

  const docRef = await addDoc(reviewsCollectionRef, newReview);
  return docRef.id;
};

/**
 * 리뷰 수정
 */
export const updateReview = async (
  reviewId: string,
  updates: Partial<Omit<Review, 'id' | 'createdAt'>>,
  newImageFiles?: File[]
): Promise<void> => {
  const reviewRef = doc(reviewsCollectionRef, reviewId);
  const updateData: any = {
    ...updates,
    updatedAt: serverTimestamp() as Timestamp,
  };

  // 새 이미지가 있으면 업로드
  if (newImageFiles && newImageFiles.length > 0) {
    const newImageUrls = await uploadImages(newImageFiles, 'reviews');
    updateData.images = [...(updates.images || []), ...newImageUrls];
  }

  await updateDoc(reviewRef, updateData);
};

/**
 * 리뷰 삭제
 */
export const deleteReview = async (reviewId: string): Promise<void> => {
  const reviewRef = doc(reviewsCollectionRef, reviewId);
  const reviewSnap = await getDoc(reviewRef);

  if (reviewSnap.exists()) {
    const reviewData = reviewSnap.data() as Review;
    // 이미지 삭제
    if (reviewData.images && reviewData.images.length > 0) {
      for (const imageUrl of reviewData.images) {
        try {
          const imageRef = ref(storage, imageUrl);
          await deleteObject(imageRef);
        } catch (error) {
          console.warn('이미지 삭제 실패:', imageUrl, error);
        }
      }
    }
  }

  await deleteDoc(reviewRef);
};

/**
 * 리뷰 조회 (상품별)
 */
export const getReviewsByProduct = async (
  productId: string | null,
  options?: {
    limitCount?: number;
    featuredOnly?: boolean;
  }
): Promise<Review[]> => {
  let q: any = reviewsCollectionRef;

  if (productId) {
    q = query(q, where('productId', '==', productId));
  }

  if (options?.featuredOnly) {
    q = query(q, where('isFeatured', '==', true));
  }

  q = query(q, orderBy('createdAt', 'desc'));

  if (options?.limitCount) {
    q = query(q, limit(options.limitCount));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
};

/**
 * 모든 리뷰 조회 (관리자용)
 */
export const getAllReviews = async (): Promise<Review[]> => {
  const q = query(reviewsCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
};

/**
 * 베스트 리뷰 조회
 */
export const getFeaturedReviews = async (limitCount: number = 10): Promise<Review[]> => {
  const q = query(
    reviewsCollectionRef,
    where('isFeatured', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
};

/**
 * 이벤트 월별 리뷰 조회
 */
export const getReviewsByEventMonth = async (eventMonth: string): Promise<Review[]> => {
  const q = query(
    reviewsCollectionRef,
    where('eventMonth', '==', eventMonth),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
};

/**
 * 리뷰 통계 조회
 */
export const getReviewStats = async (eventMonth?: string): Promise<ReviewStats> => {
  let q = query(reviewsCollectionRef);
  
  if (eventMonth) {
    q = query(q, where('eventMonth', '==', eventMonth));
  }

  const snapshot = await getDocs(q);
  const reviews = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];

  const totalReviews = reviews.length;
  const ratings = reviews.filter((r) => r.rating).map((r) => r.rating!);
  const averageRating = ratings.length > 0
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : undefined;
  const featuredReviews = reviews.filter((r) => r.isFeatured).length;
  const rewardFulfilledTotal = reviews.filter((r) => r.rewardStatus === 'FULFILLED').length;
  const thisMonthReviews = eventMonth
    ? reviews.length
    : reviews.filter((r) => {
        const reviewDate = r.createdAt instanceof Timestamp
          ? r.createdAt.toDate()
          : new Date();
        const currentMonth = new Date().toISOString().slice(0, 7);
        return reviewDate.toISOString().slice(0, 7) === currentMonth;
      }).length;

  // 상위 리뷰어 계산
  const reviewerMap = new Map<string, { name: string; reviewCount: number; rewardFulfilledCount: number }>();
  reviews.forEach((review) => {
    const name = review.userName || review.userNickname || '익명';
    const key = review.userId || `name:${name}`;
    const existing = reviewerMap.get(key) || {
      name,
      reviewCount: 0,
      rewardFulfilledCount: 0,
    };
    existing.reviewCount += 1;
    if (review.rewardStatus === 'FULFILLED') {
      existing.rewardFulfilledCount += 1;
    }
    reviewerMap.set(key, existing);
  });

  const topReviewers = Array.from(reviewerMap.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 10);

  return {
    totalReviews,
    averageRating,
    featuredReviews,
    thisMonthReviews,
    rewardFulfilledTotal,
    topReviewers,
  };
};

/**
 * 리뷰 좋아요 증가
 */
export const incrementReviewLike = async (reviewId: string): Promise<void> => {
  const reviewRef = doc(reviewsCollectionRef, reviewId);
  const snap = await getDoc(reviewRef);
  const current = (snap.data() as any)?.likeCount ?? 0;
  await updateDoc(reviewRef, {
    likeCount: Number(current) + 1,
  });
};

/**
 * 베스트 리뷰로 설정/해제
 */
export const toggleFeaturedReview = async (reviewId: string, isFeatured: boolean): Promise<void> => {
  const reviewRef = doc(reviewsCollectionRef, reviewId);
  await updateDoc(reviewRef, {
    isFeatured,
    updatedAt: serverTimestamp() as Timestamp,
  });
};

