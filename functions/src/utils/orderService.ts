// functions/src/utils/orderService.ts

import { dbAdmin as db } from '../firebase/admin.js';
import { Timestamp, Transaction } from 'firebase-admin/firestore';
import type { Order, OrderItem, Product, SalesRound, WaitlistEntry, UserDocument } from '@/shared/types';
import * as logger from "firebase-functions/logger";
import { applyClaimedDelta } from './stockStats.js';

/**
 * @description 대기 목록 항목으로부터 새로운 주문을 생성합니다. (트랜잭션 내부에서만 호출)
 * ✅ [수정] 더 이상 직접 DB를 읽지 않고, 인자로 받은 userDoc을 사용합니다.
 */
export const submitOrderFromWaitlist = async (
  transaction: Transaction,
  waitlistEntry: WaitlistEntry,
  product: Product,
  round: SalesRound,
  userDoc: UserDocument | null // ✅ [수정] userDoc을 인자로 받습니다.
): Promise<void> => {
  const { userId, quantity, variantGroupId, itemId } = waitlistEntry;
  const vg = round.variantGroups.find(v => v.id === variantGroupId);
  const itemDetail = vg?.items.find(i => i.id === itemId);

  if (!vg || !itemDetail) {
    const errorMessage = `상품 옵션(ID: ${itemId})을 찾을 수 없습니다. (상품: ${product.groupName})`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
  if (itemDetail.price === undefined || itemDetail.price === null) {
      const errorMessage = `상품(${itemDetail.name})의 가격 정보가 없습니다.`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
  }
  if (!round.pickupDate) {
      const errorMessage = `상품(${product.groupName})의 픽업 날짜 정보가 없습니다.`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
  }

  // ✅ [수정] transaction.get() 호출을 제거합니다.
  if (userDoc) {
    const userRef = db.collection("users").doc(userId);
    const newTotalOrders = (userDoc.totalOrders || 0) + 1;
    const newPickupRate = newTotalOrders > 0 ? ((userDoc.pickupCount || 0) / newTotalOrders) * 100 : 0;
    transaction.update(userRef, { totalOrders: newTotalOrders, pickupRate: newPickupRate });
  }

  const newOrderRef = db.collection("orders").doc();
  const phoneLast4 = userDoc?.phone?.slice(-4) || '';

  const orderItemPayload: OrderItem = {
    id: `${newOrderRef.id}-${itemDetail.id}`,
    productId: product.id,
    productName: product.groupName,
    imageUrl: product.imageUrls[0] || '',
    roundId: round.roundId,
    roundName: round.roundName,
    variantGroupId: vg.id,
    variantGroupName: vg.groupName,
    itemId: itemDetail.id,
    itemName: itemDetail.name,
    quantity,
    unitPrice: itemDetail.price,
    stock: itemDetail.stock,
    stockDeductionAmount: itemDetail.stockDeductionAmount || 1,
    arrivalDate: round.arrivalDate ?? null,
    deadlineDate: round.deadlineDate,
    pickupDate: round.pickupDate,
    pickupDeadlineDate: round.pickupDeadlineDate ?? null,
    isPrepaymentRequired: round.isPrepaymentRequired ?? false,
  };

  const orderData: Omit<Order, 'id'> = {
    userId,
    orderNumber: `SODOMALL-W-${Date.now()}`,
    items: [orderItemPayload],
    totalPrice: itemDetail.price * quantity,
    status: 'RESERVED',
    createdAt: Timestamp.now(),
    pickupDate: round.pickupDate,
    pickupDeadlineDate: round.pickupDeadlineDate ?? null,
    customerInfo: { name: userDoc?.displayName || '알 수 없음', phone: userDoc?.phone || '', phoneLast4 },
    notes: '대기 신청에서 자동으로 전환된 주문입니다.',
    wasPrepaymentRequired: round.isPrepaymentRequired ?? false,
    // ✅ stockStats_v1은 서버가 직접 관리 (트리거 중복 반영 방지)
    stockStatsV1Managed: true as any,
  };
  transaction.set(newOrderRef, orderData);

  // ✅ [핵심] 칠판 업데이트 (수량 증가)
  const vgId = vg.id || 'default';
  const deduct = quantity * (itemDetail.stockDeductionAmount || 1);
  applyClaimedDelta(transaction, product.id, round.roundId, vgId, deduct);
};