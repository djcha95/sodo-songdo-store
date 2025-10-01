// functions/src/scheduled/orders.ts

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { Timestamp } from "firebase-admin/firestore";

/**
 * =================================================================
 * 자동 노쇼 처리 스케줄러: markOverdueOrdersAsNoShow (✅ 수정됨)
 * =================================================================
 * 매일 새벽 3시에 실행되어, 픽업 마감일이 지났지만 여전히
 * '예약' 상태인 주문을 '노쇼'로 자동 변경합니다.
 * '선입금' 상태의 주문은 더 이상 이 스케줄러의 영향을 받지 않습니다.
 */
export const markOverdueOrdersAsNoShow = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    memory: "512MiB",
  },
  async () => {
    logger.info("매일 자동 노쇼 처리 작업을 시작합니다.");

    const now = Timestamp.now();
    
    // pickupDeadlineDate가 어제 자정 이전인 주문들을 찾습니다.
    // 이렇게 하면 당일 마감인 주문이 실수로 처리되는 것을 방지할 수 있습니다.
    const todayStart = new Date(now.toMillis());
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = Timestamp.fromMillis(todayStart.getTime() - 1);

    // ✅ [수정] '선입금(PREPAID)' 상태를 제외하고, '예약(RESERVED)' 상태의 주문만 조회하도록 변경
    const overdueOrdersQuery = db
      .collection("orders")
      .where("status", "==", "RESERVED")
      .where("pickupDeadlineDate", "<=", yesterdayEnd);

    try {
      const snapshot = await overdueOrdersQuery.get();
      if (snapshot.empty) {
        logger.info("노쇼 처리할 주문이 없습니다.");
        return;
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        logger.log(`주문 ID ${doc.id}를 NO_SHOW로 변경합니다. (마감일: ${doc.data().pickupDeadlineDate.toDate()})`);
        batch.update(doc.ref, { status: "NO_SHOW" });
      });

      await batch.commit();
      logger.info(`총 ${snapshot.size}개의 주문을 성공적으로 노쇼 처리했습니다.`);

    } catch (error) {
      logger.error("자동 노쇼 처리 작업 중 오류가 발생했습니다:", error);
    }
  }
);