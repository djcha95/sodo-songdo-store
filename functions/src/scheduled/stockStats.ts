// functions/src/scheduled/stockStats.ts
/**
 * stockStats_v1 주간 검증/재구축 스케줄러 (옵션)
 *
 * ⚠️ [효율성 개선] 매일 전체 재구축은 비효율적이므로 주간 검증용으로 변경되었습니다.
 *
 * 정책:
 * - stockStats_v1은 실시간 업데이트 방식으로 작동합니다 (주문 생성/수정/취소 시 자동 반영).
 * - 레거시 데이터는 관리자가 한 번 수동으로 rebuildStockStats_v1을 실행하면 됩니다.
 * - 이 스케줄러는 "데이터 불일치 감지/보정" 용도로만 주 1회 실행됩니다.
 *
 * 권장 사용법:
 * - 필요 없으면 이 스케줄러를 완전히 제거해도 됩니다 (실시간 업데이트만으로 충분).
 * - 또는 "every monday 04:00" 같은 주간 스케줄로 변경하여 검증용으로 사용.
 *
 * 정책:
 * - claimed 집계 포함 상태: RESERVED, PREPAID
 * - pickedUp 집계 포함 상태: PICKED_UP
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import type { Order, OrderItem } from "@/shared/types";
import { statDocId } from "../utils/stockStats.js";
import { CLAIMED_STATUSES, PICKEDUP_STATUS } from "../utils/stockPolicy.js";

const STOCK_STATS_COL = "stockStats_v1";

function itemDeduct(it: OrderItem): number {
  const q = typeof (it as any).quantity === "number" ? (it as any).quantity : 0;
  const d =
    typeof (it as any).stockDeductionAmount === "number" && (it as any).stockDeductionAmount > 0
      ? (it as any).stockDeductionAmount
      : 1;
  return q * d;
}

export const rebuildStockStatsV1Nightly = onSchedule(
  {
    // ✅ 주 1회 재구축(권장): 레거시/누락/드리프트를 자동 보정 → “수동 백필” 제거
    schedule: "every monday 04:00",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    memory: "1GiB",
    timeoutSeconds: 540,
  },
  async () => {
    // ✅ 정책은 utils/stockPolicy.ts에서 중앙 관리

    type Acc = {
      productId: string;
      roundId: string;
      claimed: Record<string, number>;
      pickedUp: Record<string, number>;
    };

    const accMap = new Map<string, Acc>();

    function ensureAcc(productId: string, roundId: string): Acc {
      const key = statDocId(productId, roundId);
      const ex = accMap.get(key);
      if (ex) return ex;
      const fresh: Acc = { productId, roundId, claimed: {}, pickedUp: {} };
      accMap.set(key, fresh);
      return fresh;
    }

    function inc(obj: Record<string, number>, vgId: string, delta: number) {
      if (!delta) return;
      obj[vgId] = (obj[vgId] || 0) + delta;
    }

    try {
      logger.info("[rebuildStockStatsV1Nightly] start");

      const pageSize = 500;
      let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      let scanned = 0;

      while (true) {
        let q = db.collection("orders").orderBy("createdAt", "asc").limit(pageSize);
        if (last) q = q.startAfter(last);

        const snap = await q.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
          scanned++;
          const o = doc.data() as Order;
          if (!o || !o.status) continue;
          const st = o.status as any;
          const isClaimed = CLAIMED_STATUSES.includes(st);
          const isPickedUp = st === PICKEDUP_STATUS;
          if (!isClaimed && !isPickedUp) continue;

          for (const it of o.items || []) {
            const productId = (it as any).productId;
            const roundId = (it as any).roundId;
            if (!productId || !roundId) continue;

            const vgId = (it as any).variantGroupId || "default";
            const deduct = itemDeduct(it);
            if (deduct <= 0) continue;

            const acc = ensureAcc(productId, roundId);
            if (isClaimed) inc(acc.claimed, vgId, deduct);
            if (isPickedUp) inc(acc.pickedUp, vgId, deduct);
          }
        }

        last = snap.docs[snap.docs.length - 1];
        if (snap.size < pageSize) break;
      }

      const writer = db.bulkWriter();
      let written = 0;

      for (const [docId, acc] of accMap.entries()) {
        const ref = db.collection(STOCK_STATS_COL).doc(docId);
        writer.set(
          ref,
          {
            productId: acc.productId,
            roundId: acc.roundId,
            claimed: acc.claimed,
            pickedUp: acc.pickedUp,
            updatedAt: AdminTimestamp.now(),
          },
          { merge: false }
        );
        written++;
      }

      await writer.close();

      logger.info("[rebuildStockStatsV1Nightly] done", {
        scannedOrders: scanned,
        statDocsWritten: written,
      });
    } catch (e) {
      logger.error("[rebuildStockStatsV1Nightly] failed", e);
    }
  }
);


