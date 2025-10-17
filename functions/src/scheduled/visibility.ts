// functions/src/scheduled/visibility.ts

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db } from "../firebase/admin.js";
import { FieldValue } from "firebase-admin/firestore";
import type { Product, SalesRound } from "@/shared/types";
import dayjs from "dayjs";

/**
 * 판매 회차(round)가 현재 활성 상태인지 확인하는 헬퍼 함수
 * @param round - 확인할 판매 회차 객체
 * @returns 활성 상태이면 true, 아니면 false
 */
const isRoundActive = (round: SalesRound): boolean => {
  if (!round.publishAt || !round.pickupDate) {
    return false; // 필수 날짜 정보가 없으면 비활성
  }

  const now = dayjs();
  const publishAt = dayjs(round.publishAt.toDate());
  
  // 2차 공구 마감은 픽업 시작일의 오후 1시
  const finalDeadline = dayjs(round.pickupDate.toDate()).hour(13).minute(0).second(0);

  // 현재 시간이 발행 시간 이후이고, 최종 마감 시간 이전이어야 함
  return now.isAfter(publishAt) && now.isBefore(finalDeadline);
};


/**
 * 10분마다 실행되어 모든 상품의 isVisible 상태를 자동으로 업데이트하는 스케줄링 함수
 */
export const updateProductVisibility = onSchedule(
  {
    schedule: "every 10 minutes",
    region: "asia-northeast3",
    timeZone: "Asia/Seoul",
    memory: "512MiB",
  },
  async () => {
    logger.info("🚀 상품 isVisible 상태 자동 업데이트 스크립트 시작");

    try {
      const productsSnapshot = await db.collection("products")
        .where("isArchived", "==", false)
        .get();
      
      if (productsSnapshot.empty) {
        logger.info("활성 상품이 없어 스크립트를 종료합니다.");
        return;
      }

      const batch = db.batch();
      let updatesCount = 0;

      productsSnapshot.docs.forEach((doc) => {
        const product = doc.data() as Product;
        const currentVisibility = product.isVisible || false;

        // 상품의 판매 회차 중 하나라도 현재 활성 상태인지 확인
        const shouldBeVisible = product.salesHistory?.some(isRoundActive) || false;

        // 현재 상태와 계산된 상태가 다를 경우에만 업데이트 배치에 추가
        if (currentVisibility !== shouldBeVisible) {
          batch.update(doc.ref, { 
            isVisible: shouldBeVisible,
            updatedAt: FieldValue.serverTimestamp(),
          });
          updatesCount++;
          logger.info(`[${product.groupName}] 상품의 isVisible 상태를 ${shouldBeVisible ? '✅ TRUE' : '❌ FALSE'}로 변경합니다.`);
        }
      });

      if (updatesCount > 0) {
        await batch.commit();
        logger.info(`✅ 총 ${updatesCount}개 상품의 isVisible 상태를 성공적으로 업데이트했습니다.`);
      } else {
        logger.info("상태 변경이 필요한 상품이 없습니다.");
      }
    } catch (error) {
      logger.error("updateProductVisibility 함수 실행 중 오류 발생", error);
    }
  }
);