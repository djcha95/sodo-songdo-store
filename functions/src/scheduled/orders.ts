// functions/src/scheduled/orders.ts

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { Timestamp } from "firebase-admin/firestore";

/**
 * =================================================================
 * 자동 노쇼 처리 스케줄러: markOverdueOrdersAsNoShow
 * =================================================================
 * 매일 새벽 3시에 실행되어, 픽업 마감일이 지났지만 노쇼 처리가 필요한
 * 상태('RESERVED', 'PREPARING', 'READY_FOR_PICKUP' 등)인 주문을
 * '노쇼'로 자동 변경합니다.
 *
 * 제외 상태: PREPAID (선입금), COMPLETED (픽업 완료), NO_SHOW, CANCELLED
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
    const todayStart = new Date(now.toMillis());
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = Timestamp.fromMillis(todayStart.getTime() - 1);

    // 노쇼 처리 대상이 되는 주문 상태 목록 (선입금/픽업 완료/취소/노쇼 상태는 제외)
    // 프로젝트의 전체 주문 상태에 맞게 이 배열을 조정해야 합니다.
    const eligibleStatuses = [
      "RESERVED",         // 예약 (가장 일반적인 노쇼 대상)
      "PREPARING",        // 준비 중 (노쇼 대상일 수 있음)
      "READY_FOR_PICKUP", // 픽업 준비 완료 (노쇼 대상일 수 있음)
    ];

    // ✅ [수정] 'status'가 eligibleStatuses 중 하나이며, 마감일이 지난 주문 조회
    const overdueOrdersQuery = db
      .collection("orders")
      .where("status", "in", eligibleStatuses) // 명시된 상태들만 대상으로 지정
      .where("pickupDeadlineDate", "<=", yesterdayEnd);

    try {
      const snapshot = await overdueOrdersQuery.get();
      if (snapshot.empty) {
        logger.info("노쇼 처리할 주문이 없습니다.");
        return;
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        logger.log(`주문 ID ${doc.id}를 NO_SHOW로 변경합니다. (현재 상태: ${doc.data().status}, 마감일: ${doc.data().pickupDeadlineDate.toDate()})`);
        batch.update(doc.ref, { status: "NO_SHOW" });
      });

      await batch.commit();
      logger.info(`총 ${snapshot.size}개의 주문을 성공적으로 노쇼 처리했습니다.`);

    } catch (error) {
      logger.error("자동 노쇼 처리 작업 중 오류가 발생했습니다:", error);
    }
  }
);