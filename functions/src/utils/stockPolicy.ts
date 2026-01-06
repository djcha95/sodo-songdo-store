// functions/src/utils/stockPolicy.ts
import type { OrderStatus } from "@/shared/types";

/**
 * ✅ 재고(oversell) 정책을 중앙에서 관리합니다.
 *
 * - CLAIMED_STATUSES: "예약 점유"로 간주하는 상태들
 * - PICKEDUP_STATUS: "픽업 완료" 상태
 * - CANCELLED_STATUSES: 점유에서 제외되는 상태들
 *
 * 필요 시 이 파일만 수정하면 정책을 일괄 변경할 수 있습니다.
 */

export const CLAIMED_STATUSES: ReadonlyArray<OrderStatus> = ["RESERVED", "PREPAID"];
export const PICKEDUP_STATUS: OrderStatus = "PICKED_UP";
export const CANCELLED_STATUSES: ReadonlyArray<OrderStatus> = ["CANCELED", "LATE_CANCELED", "NO_SHOW"];

export function isClaimedStatus(status: OrderStatus): boolean {
  return CLAIMED_STATUSES.includes(status);
}

export function isCancelledLike(status: OrderStatus): boolean {
  return CANCELLED_STATUSES.includes(status);
}


