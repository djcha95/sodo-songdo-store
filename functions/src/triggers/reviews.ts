// functions/src/triggers/reviews.ts

import { onDocumentCreated, FirestoreEvent, DocumentSnapshot } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import type { Review, Order, OrderItem, Product } from "@/shared/types";

/**
 * 리뷰 생성 시 크래커와 콤부차 픽업카드 자동 생성
 */
export const onReviewCreated = onDocumentCreated(
  {
    document: "reviews/{reviewId}",
    region: "asia-northeast3",
  },
  async (event: FirestoreEvent<DocumentSnapshot | undefined, { reviewId: string }>) => {
    const snapshot = event.data;
    if (!snapshot || !snapshot.exists) {
      logger.warn(`Review ${event.params.reviewId} does not exist.`);
      return;
    }

    const review = snapshot.data() as Review;
    const reviewId = event.params.reviewId;

    // userId가 없으면 픽업카드를 생성할 수 없음
    if (!review.userId) {
      logger.info(`Review ${reviewId} has no userId. Skipping pickup card creation.`);
      return;
    }

    // 리뷰가 생성되면 자동으로 픽업카드를 생성 (rewardStatus와 관계없이)

    try {
      // 이미 픽업카드가 생성되었는지 확인 (중복 생성 방지)
      const existingOrdersSnapshot = await db.collection("orders")
        .where("userId", "==", review.userId)
        .where("notes", ">=", `[리뷰 보상]`)
        .where("notes", "<=", `[리뷰 보상]~`)
        .get();
      
      const hasExistingPickupCard = existingOrdersSnapshot.docs.some(doc => {
        const order = doc.data() as Order;
        return order.notes?.includes(`리뷰 ID: ${review.id}`);
      });

      if (hasExistingPickupCard) {
        logger.info(`Pickup cards already exist for review ${reviewId}. Skipping.`);
        return;
      }

      // 사용자 정보 조회
      const userRef = db.collection("users").doc(review.userId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        logger.warn(`User ${review.userId} not found for review ${reviewId}.`);
        return;
      }

      const userData = userDoc.data();
      if (!userData) {
        logger.warn(`User ${review.userId} data is empty.`);
        return;
      }

      // 크래커와 콤부차 상품 찾기
      const productsSnapshot = await db.collection("products").get();
      let crackerProduct: Product | null = null;
      let kombuchaProduct: Product | null = null;

      productsSnapshot.forEach((doc) => {
        const product = { id: doc.id, ...doc.data() } as Product;
        const productName = product.groupName?.toLowerCase() || '';
        
        // 크래커 상품 찾기 (크래커, 미주라 크래커 등)
        if (!crackerProduct && (productName.includes('크래커') || productName.includes('cracker'))) {
          crackerProduct = product;
        }
        
        // 콤부차 상품 찾기
        if (!kombuchaProduct && (productName.includes('콤부차') || productName.includes('kombucha'))) {
          kombuchaProduct = product;
        }
      });

      // 크래커 픽업카드 생성 (크래커 이벤트인 경우)
      if (review.rewardType === 'CRACKER_7500' && crackerProduct) {
        await createPickupCardForReview(
          review,
          review.userId,
          userData,
          crackerProduct,
          '크래커(7,500원 상당)'
        );
        logger.info(`Created cracker pickup card for review ${reviewId}.`);
      }

      // 콤부차 픽업카드 생성 (리뷰를 추가하면 항상 콤부차도 주는 것으로 설정)
      if (kombuchaProduct) {
        await createPickupCardForReview(
          review,
          review.userId,
          userData,
          kombuchaProduct,
          '콤부차'
        );
        logger.info(`Created kombucha pickup card for review ${reviewId}.`);
      } else {
        logger.warn(`Kombucha product not found. Skipping kombucha pickup card creation for review ${reviewId}.`);
      }

      logger.info(`Successfully created pickup cards for review ${reviewId}.`);
    } catch (error) {
      logger.error(`Error creating pickup cards for review ${reviewId}:`, error);
    }
  }
);

/**
 * 리뷰 보상용 픽업카드 생성 헬퍼 함수
 */
async function createPickupCardForReview(
  review: Review,
  userId: string,
  userData: any,
  product: Product,
  rewardName: string
): Promise<void> {
  // 현재 활성화된 판매 라운드 찾기
  const activeRound = product.salesHistory?.find((round) => {
    // 판매 중인 라운드 찾기 (간단한 로직)
    return round.variantGroups && round.variantGroups.length > 0;
  });

  if (!activeRound || !activeRound.variantGroups || activeRound.variantGroups.length === 0) {
    logger.warn(`No active round found for product ${product.id} (${product.groupName}). Skipping pickup card creation.`);
    return;
  }

  // 첫 번째 variantGroup과 첫 번째 item 사용
  const variantGroup = activeRound.variantGroups[0];
  const item = variantGroup.items?.[0];

  if (!item || item.price === undefined || item.price === null) {
    logger.warn(`No valid item found for product ${product.id}. Skipping pickup card creation.`);
    return;
  }

  // Timestamp 변환 헬퍼 함수
  const toTimestamp = (value: any): Timestamp => {
    if (value instanceof Timestamp) return value;
    if (value instanceof Date) return Timestamp.fromDate(value);
    if (value && typeof value === 'object' && 'toDate' in value) {
      return Timestamp.fromDate((value as any).toDate());
    }
    return Timestamp.fromDate(new Date(value));
  };

  // 픽업 날짜 설정 (라운드의 픽업 날짜 또는 오늘로부터 일주일 후)
  const pickupDate = activeRound.pickupDate 
    ? toTimestamp(activeRound.pickupDate)
    : Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)); // 일주일 후

  // 주문 아이템 생성
  const orderItem: OrderItem = {
    id: `review-reward-${review.id}-${Date.now()}`,
    productId: product.id,
    productName: product.groupName || '',
    imageUrl: product.imageUrls?.[0] || '',
    roundId: activeRound.roundId,
    roundName: activeRound.roundName || '',
    variantGroupId: variantGroup.id || 'default',
    variantGroupName: variantGroup.groupName || '',
    itemId: item.id,
    itemName: item.name || '',
    quantity: 1,
    unitPrice: item.price,
    stock: item.stock || null,
    stockDeductionAmount: item.stockDeductionAmount ?? 1,
    arrivalDate: activeRound.arrivalDate 
      ? toTimestamp(activeRound.arrivalDate)
      : null,
    pickupDate: pickupDate,
    deadlineDate: activeRound.deadlineDate
      ? toTimestamp(activeRound.deadlineDate)
      : pickupDate,
    isPrepaymentRequired: activeRound.isPrepaymentRequired ?? false,
  };

  // 주문 생성
  const orderRef = db.collection("orders").doc();
  const phoneLast4 = userData.phone?.slice(-4) || '';

  const newOrder: Order = {
    id: orderRef.id,
    orderNumber: `REVIEW-REWARD-${Date.now()}-${review.id.slice(-6)}`,
    userId: userId,
    items: [orderItem],
    totalPrice: item.price,
    status: 'RESERVED' as const,
    customerInfo: {
      name: userData.displayName || review.userName || '고객',
      phone: userData.phone || '',
      phoneLast4: phoneLast4,
    },
    createdAt: Timestamp.now(),
    pickupDate: pickupDate,
    wasPrepaymentRequired: activeRound.isPrepaymentRequired ?? false,
    notes: `[리뷰 보상] ${rewardName} - 리뷰 ID: ${review.id}`,
  };

  await orderRef.set(newOrder);
  logger.info(`Created pickup card order ${orderRef.id} for review ${review.id} (${rewardName}).`);
}
