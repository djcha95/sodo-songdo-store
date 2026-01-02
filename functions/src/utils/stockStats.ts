// functions/src/utils/stockStats.ts
// ✅ stockStats_v1 컬렉션 업데이트를 위한 공통 유틸리티

import { dbAdmin as db } from "../firebase/admin.js";
import { Timestamp as AdminTimestamp, FieldValue, Transaction } from "firebase-admin/firestore";

const STOCK_STATS_COL = "stockStats_v1";

export function statDocId(productId: string, roundId: string): string {
  return `${productId}__${roundId}`;
}

function claimedField(variantGroupId: string): string {
  return `claimed.${variantGroupId}`;
}

function pickedUpField(variantGroupId: string): string {
  return `pickedUp.${variantGroupId}`;
}

/**
 * ✅ stockStats_v1 컬렉션의 claimed 필드를 업데이트합니다.
 * @param tx 트랜잭션 객체
 * @param productId 상품 ID
 * @param roundId 회차 ID
 * @param variantGroupId 옵션 그룹 ID
 * @param delta 증감량 (양수면 증가, 음수면 감소)
 */
export function applyClaimedDelta(
  tx: Transaction,
  productId: string,
  roundId: string,
  variantGroupId: string,
  delta: number
): void {
  if (!delta) return;

  const ref = db.collection(STOCK_STATS_COL).doc(statDocId(productId, roundId));
  tx.set(
    ref,
    {
      productId,
      roundId,
      updatedAt: AdminTimestamp.now(),
      [claimedField(variantGroupId)]: FieldValue.increment(delta),
    } as any,
    { merge: true }
  );
}

/**
 * ✅ stockStats_v1 컬렉션의 pickedUp 필드를 업데이트합니다.
 * @param tx 트랜잭션 객체
 * @param productId 상품 ID
 * @param roundId 회차 ID
 * @param variantGroupId 옵션 그룹 ID
 * @param delta 증감량 (양수면 증가, 음수면 감소)
 */
export function applyPickedUpDelta(
  tx: Transaction,
  productId: string,
  roundId: string,
  variantGroupId: string,
  delta: number
): void {
  if (!delta) return;

  const ref = db.collection(STOCK_STATS_COL).doc(statDocId(productId, roundId));
  tx.set(
    ref,
    {
      productId,
      roundId,
      updatedAt: AdminTimestamp.now(),
      [pickedUpField(variantGroupId)]: FieldValue.increment(delta),
    } as any,
    { merge: true }
  );
}

