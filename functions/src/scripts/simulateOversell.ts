// functions/src/scripts/simulateOversell.ts
/**
 * ✅ 동시성(oversell) 시뮬레이션 스크립트
 *
 * 목적:
 * - 같은 (productId, roundId, variantGroupId)에 대해 "재고 1"인 상황에서
 *   2개의 트랜잭션이 동시에 예약(claimed)을 시도하면, 반드시 1개만 성공해야 합니다.
 *
 * 사용 방법(권장: 에뮬레이터):
 * 1) Firestore Emulator 실행 후
 * 2) 환경변수 FIRESTORE_EMULATOR_HOST 설정
 * 3) functions 빌드 후 실행:
 *    - `node lib/src/scripts/simulateOversell.js`
 */

import { admin, dbAdmin as db } from "../firebase/admin.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { statDocId } from "../utils/stockStats.js";

const STOCK_STATS_COL = "stockStats_v1";

type SimProduct = {
  isArchived: boolean;
  createdAt: any;
  salesHistory: Array<{
    roundId: string;
    roundName: string;
    variantGroups: Array<{
      id: string;
      groupName: string;
      totalPhysicalStock: number;
      items: Array<{ id: string; name: string; stockDeductionAmount: number; price: number; stock: number }>;
    }>;
  }>;
};

async function main() {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }

  const productId = `SIM_PRODUCT_${Date.now()}`;
  const roundId = "R1";
  const vgId = "VG1";
  const stock = 1;

  const product: SimProduct = {
    isArchived: false,
    createdAt: Timestamp.now(),
    salesHistory: [
      {
        roundId,
        roundName: "시뮬레이션 회차",
        variantGroups: [
          {
            id: vgId,
            groupName: "옵션",
            totalPhysicalStock: stock,
            items: [{ id: "I1", name: "1개", stockDeductionAmount: 1, price: 1000, stock: -1 }],
          },
        ],
      },
    ],
  };

  // 1) 초기 데이터 세팅
  await db.collection("products").doc(productId).set(product as any);
  await db.collection(STOCK_STATS_COL).doc(statDocId(productId, roundId)).set(
    {
      productId,
      roundId,
      claimed: { [vgId]: 0 },
      pickedUp: { [vgId]: 0 },
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  async function reserve(label: string) {
    return db.runTransaction(async (tx) => {
      const statRef = db.collection(STOCK_STATS_COL).doc(statDocId(productId, roundId));
      const statSnap = await tx.get(statRef);
      const stat = statSnap.exists ? (statSnap.data() as any) : {};
      const claimedNow = Number(stat?.claimed?.[vgId] || 0);
      const pickedUpNow = Number(stat?.pickedUp?.[vgId] || 0);
      const remaining = stock - claimedNow - pickedUpNow;
      if (remaining < 0) throw new Error(`[${label}] remaining<0 (data inconsistent)`);
      if (1 > remaining) throw new Error(`[${label}] oversell prevented (remaining=${remaining})`);

      // claimed 증가
      tx.set(
        statRef,
        {
          updatedAt: Timestamp.now(),
          [`claimed.${vgId}`]: FieldValue.increment(1),
        } as any,
        { merge: true }
      );

      // 주문 생성(테스트용)
      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        userId: `SIM_USER_${label}`,
        orderNumber: `SIM-${Date.now()}-${label}`,
        items: [
          {
            id: `SIM-ITEM-${label}`,
            productId,
            productName: "SIM",
            imageUrl: "",
            roundId,
            roundName: "SIM",
            variantGroupId: vgId,
            variantGroupName: "SIM",
            itemId: "I1",
            itemName: "1개",
            quantity: 1,
            unitPrice: 1000,
            stock: -1,
            stockDeductionAmount: 1,
            arrivalDate: null,
            pickupDate: Timestamp.now(),
            deadlineDate: Timestamp.now(),
          },
        ],
        totalPrice: 1000,
        status: "RESERVED",
        createdAt: Timestamp.now(),
        pickupDate: Timestamp.now(),
        notes: "SIM",
        stockStatsV1Managed: true,
      });

      return { ok: true, orderId: orderRef.id };
    });
  }

  // 2) 동시 2개 요청
  const [a, b] = await Promise.allSettled([reserve("A"), reserve("B")]);
  console.log("RESULT A:", a.status, a.status === "fulfilled" ? a.value : a.reason?.message);
  console.log("RESULT B:", b.status, b.status === "fulfilled" ? b.value : b.reason?.message);

  // 3) 최종 claimed 확인
  const finalStat = await db.collection(STOCK_STATS_COL).doc(statDocId(productId, roundId)).get();
  console.log("FINAL claimed:", (finalStat.data() as any)?.claimed?.[vgId]);

  // 기대값: fulfilled 1개, rejected 1개, claimed=1
}

main().catch((e) => {
  console.error("simulateOversell failed:", e);
  process.exit(1);
});





