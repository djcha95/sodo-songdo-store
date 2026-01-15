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
import type { Review, ReviewStats, UserDocument } from '@/shared/types';
import { uploadImages } from './generalService';
import dayjs from 'dayjs';

const reviewsCollectionRef = collection(db, 'reviews');
const usersCollectionRef = collection(db, 'users');

const normalizeEventMonth = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // 가장 흔한 입력 케이스들을 엄격 파싱으로 정규화
  const parsed = dayjs(trimmed, ['YYYY-MM', 'YYYY-M', 'YYYY/MM', 'YYYY/M', 'YYYY-MM-DD', 'YYYY/M/D'], true);
  if (parsed.isValid()) return parsed.format('YYYY-MM');

  // 마지막으로 느슨한 파싱도 시도 (예: Date string)
  const fallback = dayjs(trimmed);
  return fallback.isValid() ? fallback.format('YYYY-MM') : undefined;
};

/**
 * 리뷰 배열에 phoneLast4를 보완하는 헬퍼 함수
 */
const enrichReviewsWithPhoneLast4 = async (reviews: Review[]): Promise<Review[]> => {
  // phoneLast4가 없는 리뷰 중 userId가 있는 것들만 필터링
  const reviewsNeedingPhone = reviews.filter(
    (r) => r.userId && !r.phoneLast4
  );

  if (reviewsNeedingPhone.length === 0) return reviews;

  // 사용자 정보를 병렬로 조회
  const userPhoneMap = new Map<string, string | undefined>();
  await Promise.all(
    reviewsNeedingPhone.map(async (review) => {
      if (review.userId && !userPhoneMap.has(review.userId)) {
        const phoneLast4 = await getUserPhoneLast4(review.userId);
        if (phoneLast4) {
          userPhoneMap.set(review.userId, phoneLast4);
        }
      }
    })
  );

  // phoneLast4 보완
  return reviews.map((review) => {
    if (review.userId && !review.phoneLast4 && userPhoneMap.has(review.userId)) {
      return {
        ...review,
        phoneLast4: userPhoneMap.get(review.userId),
      };
    }
    return review;
  });
};

/**
 * 홈/리스트에서 보여줄 최신 리뷰
 */
export const getRecentReviews = async (limitCount: number = 20): Promise<Review[]> => {
  const q = query(reviewsCollectionRef, orderBy('createdAt', 'desc'), limit(limitCount));
  const snapshot = await getDocs(q);
  const reviews = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
  
  // phoneLast4 보완
  return await enrichReviewsWithPhoneLast4(reviews);
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
  const reviews = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
  
  // phoneLast4 보완
  return await enrichReviewsWithPhoneLast4(reviews);
};

/**
 * userId로부터 phoneLast4를 조회하는 헬퍼 함수
 */
const getUserPhoneLast4 = async (userId: string | undefined): Promise<string | undefined> => {
  if (!userId) return undefined;
  try {
    const userDoc = await getDoc(doc(usersCollectionRef, userId));
    if (userDoc.exists()) {
      const userData = userDoc.data() as UserDocument;
      return userData.phoneLast4;
    }
  } catch (error) {
    console.warn('사용자 정보 조회 실패:', error);
  }
  return undefined;
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

  // ✅ undefined 필드 제거 (Firestore는 undefined 값을 허용하지 않음)
  const cleanReviewData: any = {};
  Object.keys(reviewData).forEach((key) => {
    const value = (reviewData as any)[key];
    // null도 제거하지 않고 유지 (명시적으로 null로 설정된 경우)
    if (value !== undefined) {
      cleanReviewData[key] = value;
    }
  });

  // ✅ userId가 있지만 phoneLast4가 없으면 사용자 정보에서 가져오기
  if (cleanReviewData.userId && !cleanReviewData.phoneLast4) {
    const phoneLast4 = await getUserPhoneLast4(cleanReviewData.userId);
    if (phoneLast4) {
      cleanReviewData.phoneLast4 = phoneLast4;
    }
  }

  // ✅ eventMonth 정규화 (포맷 불일치로 고객 페이지에서 필터링 누락되는 문제 방지)
  const normalizedEventMonth = normalizeEventMonth(cleanReviewData.eventMonth) || dayjs().format('YYYY-MM');

  const newReview = {
    ...cleanReviewData,
    images: imageUrls.length > 0 ? imageUrls : reviewData.images || [],
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
    likeCount: 0,
    isVerified: reviewData.isFromKakao ? true : false, // 카카오톡 리뷰는 자동 검증
    // ✅ eventMonth가 없으면 현재 월로 자동 설정 + 저장 시 항상 YYYY-MM로 강제
    eventMonth: normalizedEventMonth,
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

  // ✅ eventMonth 업데이트가 들어오면 항상 YYYY-MM로 정규화
  if ('eventMonth' in updates) {
    updateData.eventMonth = normalizeEventMonth((updates as any).eventMonth) || dayjs().format('YYYY-MM');
  }

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
  const reviews = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
  
  // phoneLast4 보완
  return await enrichReviewsWithPhoneLast4(reviews);
};

/**
 * 모든 리뷰 조회 (관리자용)
 */
export const getAllReviews = async (): Promise<Review[]> => {
  const q = query(reviewsCollectionRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  const reviews = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
  
  // phoneLast4 보완
  return await enrichReviewsWithPhoneLast4(reviews);
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
  const reviews = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
  
  // phoneLast4 보완
  return await enrichReviewsWithPhoneLast4(reviews);
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
  const reviews = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Review[];
  
  // phoneLast4 보완
  return await enrichReviewsWithPhoneLast4(reviews);
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

