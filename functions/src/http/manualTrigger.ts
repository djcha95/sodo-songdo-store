// functions/src/http/manualTrigger.ts

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { dbAdmin as db } from "../firebase/admin.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { executePickupReminders } from "../scheduled/notifications.js";
import type { Order, UserDocument, LoyaltyTier, PointLog, Product, SalesRound } from "@/shared/types";
import dayjs from "dayjs";


// =================================================================
// ✅ [기존 함수] 픽업 알림 수동 발송 (유지)
// =================================================================

/**
 * @description 오늘자 픽업 리마인더를 수동으로 즉시 실행하기 위한 임시 HTTP 함수
 */
export const manualSendPickupReminders = onRequest(
  {
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"], 
  },
  async (req, res) => {
    logger.info("수동으로 픽업 리마인더 발송을 시작합니다.");
    try {
      await executePickupReminders();
      
      const successMessage = "오늘자 픽업 리마인더가 성공적으로 발송되었습니다.";
      logger.info(successMessage);
      res.status(200).send(successMessage);
    } catch (error) {
      const errorMessage = "수동 픽업 리마인더 발송 중 오류가 발생했습니다.";
      logger.error(errorMessage, error);
      res.status(500).send(errorMessage);
    }
  }
);


// =================================================================
// ✅ [신규 추가] 과거 데이터 재계산 및 보정 스크립트
// =================================================================

// 등급 계산 로직
const calculateTier = (pickupCount: number, noShowCount: number): LoyaltyTier => {
    if (noShowCount >= 3) return '참여 제한';
    if (noShowCount >= 1) return '주의 요망';
    if (pickupCount >= 50) return '공구의 신';
    if (pickupCount >= 30) return '공구왕';
    if (pickupCount >= 10) return '공구요정';
    return '공구새싹';
};

/**
 * @description 모든 사용자의 포인트, 픽업/노쇼 횟수를 주문 내역 기반으로 재계산하는 관리자용 함수
 */
export const reaggregateAllUserData = onCall({
  region: "asia-northeast3",
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (request) => {
  // 1. 관리자 인증
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "인증된 사용자만 실행할 수 있습니다.");
  }
  const adminUser = await getAuth().getUser(request.auth.uid);
  const userRole = adminUser.customClaims?.role;
  if (userRole !== "admin" && userRole !== "master") {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }

  logger.info(`[Data-Reaggregation] Started by admin: ${request.auth.uid}`);

  try {
    const usersSnapshot = await db.collection("users").get();
    let processedUserCount = 0;
    const totalUsers = usersSnapshot.size;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const originalUserData = userDoc.data() as UserDocument;

      const ordersSnapshot = await db
        .collection("orders")
        .where("userId", "==", userId)
        .get();
      const userOrders = ordersSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Order)
      );

      let newPickupCount = 0;
      let newNoShowCount: number = 0; // 0.5 단위 포함
      const newPointLogs: Omit<PointLog, "id">[] = [];

      // --- 각 주문을 순회하며 집계 ---
      for (const order of userOrders) {
        if (order.status === "PICKED_UP") {
          newPickupCount++;

          const purchasePoints = Math.floor((order.totalPrice || 0) * 0.005);
          const prepaidBonus = order.wasPrepaymentRequired ? 5 : 0;
          const totalPoints = purchasePoints + prepaidBonus;

          if (totalPoints > 0) {
            const createdAtValue = order.pickedUpAt || order.createdAt;
            if (createdAtValue && !(createdAtValue instanceof FieldValue)) {
              // ⚠️ 비즈니스 로직 확인 필요:
              // 현재 -100 페널티를 추가하고 있음. 픽업인 경우 보통 +포인트일 수 있으니 의도라면 유지, 아니라면 수정 필요.
              newPointLogs.push({
                amount: -100,
                reason: `[재계산] 미수령 페널티 (${order.id.slice(-6)})`,
                createdAt: (order.pickedUpAt || order.createdAt) as Timestamp,
                orderId: order.id,
                expiresAt: null,
              });
            }
          }
        }

        if (order.status === "NO_SHOW") {
          newNoShowCount += 1;
          const createdAtValue = order.canceledAt || Timestamp.now();
          if (createdAtValue && !(createdAtValue instanceof FieldValue)) {
            newPointLogs.push({
              amount: -100,
              reason: `[재계산] 미수령 페널티 (${order.id.slice(-6)})`,
              createdAt: (order.pickedUpAt || order.createdAt) as Timestamp,
              orderId: order.id,
              expiresAt: null,
            });
          }
        }

        if (order.status === "LATE_CANCELED") {
          newNoShowCount += 0.5;
          const createdAtValue = order.canceledAt || Timestamp.now();
          if (createdAtValue && !(createdAtValue instanceof FieldValue)) {
            newPointLogs.push({
              amount: -50,
              reason: `[재계산] 마감 임박 취소 (${order.id.slice(-6)})`,
              createdAt: (order.pickedUpAt || order.createdAt) as Timestamp,
              orderId: order.id,
              expiresAt: null,
            });
          }
        }
      } // ✅ 여기서 order 반복문을 닫아야 합니다!

      // --- 반복문 바깥: 사용자 단위 집계/정리 ---
      const manualPointsAndLogs = (originalUserData.pointHistory || []).filter(
        (log) => !log.orderId && (log.reason.includes("(수동)") || !log.reason.includes("구매 확정"))
      );

      const manualPointsTotal = manualPointsAndLogs.reduce((sum, log) => sum + log.amount, 0);
      const recalculatedOrderPoints = newPointLogs.reduce((sum, log) => sum + log.amount, 0);

      const newTotalPoints = manualPointsTotal + recalculatedOrderPoints;
      const newTier = calculateTier(newPickupCount, newNoShowCount);

      const finalPointHistory = [
        ...manualPointsAndLogs.map((log) => ({
          ...log,
          reason: log.reason.replace("[재계산] ", ""),
        })), // 기존 수동 로그
        ...newPointLogs, // 재계산된 주문 관련 로그
      ].sort(
        (a, b) => (b.createdAt as Timestamp).toMillis() - (a.createdAt as Timestamp).toMillis()
      );

      const finalUpdateData = {
        pickupCount: newPickupCount,
        noShowCount: newNoShowCount,
        points: newTotalPoints,
        loyaltyTier: newTier,
        pointHistory: finalPointHistory,
      };

      await db.collection("users").doc(userId).update(finalUpdateData);

      processedUserCount++;
      if (processedUserCount % 50 === 0) {
        logger.info(
          `[Data-Reaggregation] Progress: ${processedUserCount} / ${totalUsers} users processed.`
        );
      }
    } // 사용자 루프 끝

    const successMessage = `[Data-Reaggregation] Success! Processed ${processedUserCount} users.`;
    logger.info(successMessage);
    return { success: true, message: successMessage };
  } catch (error) {
    logger.error("[Data-Reaggregation] An error occurred:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "데이터 재계산 중 오류가 발생했습니다.");
  }
});

// =================================================================
// ✅ [신규 추가] 120P 미만 사용자 포인트 보정 스크립트
// =================================================================
export const grant100PointsToAllUsers = onCall({
    region: "asia-northeast3",
    timeoutSeconds: 300,
    memory: "512MiB",
}, async (request) => {
    // 1. 관리자 인증
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "인증된 사용자만 실행할 수 있습니다.");
    }
    const adminUser = await getAuth().getUser(request.auth.uid);
    const userRole = adminUser.customClaims?.role;
    if (userRole !== 'admin' && userRole !== 'master') {
        throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    logger.info(`[Grant-100P] Started by admin: ${request.auth.uid}.`);

    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            return { success: true, message: "포인트를 지급할 사용자가 없습니다." };
        }

        const batch = db.batch();
        const POINTS_TO_ADD = 100;

        const newPointLog: Omit<PointLog, "id"> = {
            amount: POINTS_TO_ADD,
            reason: `[공지] 포인트 시스템 오류 보상`,
            createdAt: Timestamp.now(),
            expiresAt: null, // 보상 포인트는 만료일 없음
        };

        usersSnapshot.forEach(doc => {
            batch.update(doc.ref, {
                points: FieldValue.increment(POINTS_TO_ADD),
                pointHistory: FieldValue.arrayUnion(newPointLog)
            });
        });

        await batch.commit();

        const successMessage = `[Grant-100P] Success! Granted 100 points to ${usersSnapshot.size} users.`;
        logger.info(successMessage);
        return { success: true, message: `${usersSnapshot.size}명의 모든 사용자에게 100포인트가 지급되었습니다.` };

    } catch (error) {
        logger.error("[Grant-100P] An error occurred:", error);
        throw new HttpsError("internal", "포인트 지급 중 오류가 발생했습니다.");
    }
});


// 💡 [헬퍼 함수 추가] visibility.ts에 있던 헬퍼 함수를 그대로 가져옵니다.
const isRoundActive = (round: SalesRound): boolean => {
  if (!round.publishAt || !round.pickupDate) {
    return false;
  }
  const now = dayjs();
  const publishAt = dayjs(round.publishAt.toDate());
  const finalDeadline = dayjs(round.pickupDate.toDate()).hour(13).minute(0).second(0);
  return now.isAfter(publishAt) && now.isBefore(finalDeadline);
};


/**
 * =================================================================
 * ✅ [신규 추가] 모든 상품의 isVisible 필드를 초기화하는 일회성 함수
 * =================================================================
 * 기존에 isVisible 필드가 없던 상품들을 위해 딱 한 번만 실행하는 스크립트입니다.
 */
export const backfillProductVisibility = onCall(
  {
    region: "asia-northeast3",
    memory: "1GiB", // 많은 상품을 처리하기 위해 메모리 증량
    timeoutSeconds: 540, // 9분
  },
  async (request) => {
    // 1. 관리자 권한 확인
    const userRole = request.auth?.token.role;
    if (!userRole || !['admin', 'master'].includes(userRole)) {
      throw new HttpsError("permission-denied", "관리자만 이 기능을 사용할 수 있습니다.");
    }
    
    logger.info("🚀 [일회성 스크립트] 모든 상품 isVisible 필드 초기화 시작...");

    try {
      const productsSnapshot = await db.collection("products")
        .where("isArchived", "==", false)
        .get();
      
      if (productsSnapshot.empty) {
        logger.info("처리할 상품이 없습니다.");
        return { success: true, message: "처리할 상품이 없습니다." };
      }

      const batch = db.batch();
      let updatesCount = 0;

      productsSnapshot.docs.forEach((doc) => {
        const product = doc.data() as Product;

        // isVisible 필드가 이미 있는지 확인. 이미 있으면 건너뜁니다.
        if (product.isVisible !== undefined) {
          return;
        }

        // isVisible 초기값 계산
        const shouldBeVisible = product.salesHistory?.some(isRoundActive) || false;

        batch.update(doc.ref, { 
          isVisible: shouldBeVisible,
        });
        updatesCount++;
        logger.info(`  -> [${product.groupName}] 상품 isVisible: ${shouldBeVisible}로 설정`);
      });

      if (updatesCount > 0) {
        await batch.commit();
        const message = `✅ 총 ${updatesCount}개 상품의 isVisible 필드를 성공적으로 초기화했습니다.`;
        logger.info(message);
        return { success: true, message };
      } else {
        const message = "모든 상품에 이미 isVisible 필드가 설정되어 있습니다.";
        logger.info(message);
        return { success: true, message };
      }
    } catch (error) {
      logger.error("backfillProductVisibility 함수 실행 중 오류 발생", error);
      throw new HttpsError("internal", "스크립트 실행 중 오류가 발생했습니다.");
    }
  }
);

/**
 * =================================================================
 * ✅ [신규 추가] 웰컴 스낵 주문을 숨김(archive) 처리하는 함수
 * =================================================================
 * 'GIFT_WELCOME_SNACK' productId를 가진 모든 주문을 찾아 isArchived: true로 업데이트합니다.
 * 이 함수는 배포 후 단 한 번만 URL을 통해 직접 실행하면 됩니다.
 */
export const archiveWelcomeSnackOrders = onRequest(
  { region: "asia-northeast3", timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    try {
      logger.info("🚀 [일회성 스크립트] 웰컴 스낵 주문 숨김 처리 시작...");
      const ordersRef = db.collection("orders");
      // 쿼리: isArchived 필드가 true가 아닌 모든 주문을 가져옵니다.
      const querySnapshot = await ordersRef.where("isArchived", "!=", true).get();

      if (querySnapshot.empty) {
        logger.info("숨김 처리할 주문이 없습니다.");
        res.status(200).send("✅ 처리할 웰컴 스낵 주문이 없습니다.");
        return;
      }

      const batch = db.batch();
      let updateCount = 0;
      const MAX_BATCH_SIZE = 500; // Firestore batch 쓰기 제한

      logger.info(`전체 ${querySnapshot.size}개의 주문을 확인 중...`);

      for (const doc of querySnapshot.docs) {
        const order = doc.data() as Order;
        
        // 주문 항목(items)에 'GIFT_WELCOME_SNACK'이 포함되어 있는지 확인
        const isWelcomeSnackOrder = order.items?.some(
          (item) => item.productId === "GIFT_WELCOME_SNACK"
        );

        if (isWelcomeSnackOrder) {
          batch.update(doc.ref, { isArchived: true });
          updateCount++;
          logger.info(`  -> 주문 ID: ${doc.id} 숨김 처리 목록에 추가`);

          // 배치 크기가 500에 도달하면 커밋하고 새 배치를 시작합니다.
          if (updateCount % MAX_BATCH_SIZE === 0) {
            await batch.commit();
            logger.info(`🔥 ${updateCount}개의 주문을 처리했습니다. 다음 배치를 시작합니다...`);
            // batch = db.batch(); // batch.commit() 후에 자동으로 새 배치가 되므로 재할당 필요 없음
          }
        }
      }

      // 남은 업데이트가 있는 경우 최종 커밋
      if (updateCount % MAX_BATCH_SIZE !== 0) {
        await batch.commit();
      }

      if (updateCount > 0) {
        const successMessage = `✅ 성공: 총 ${updateCount}개의 웰컴 스낵 주문을 숨김 처리했습니다.`;
        logger.info(successMessage);
        res.status(200).send(successMessage);
      } else {
        const message = "모든 웰컴 스낵 주문이 이미 처리되었거나, 해당 주문이 없습니다.";
        logger.info(message);
        res.status(200).send(message);
      }

    } catch (error) {
      logger.error("archiveWelcomeSnackOrders 함수 실행 중 오류 발생", error);
      res.status(500).send("❌ 오류가 발생했습니다. Functions 로그를 확인해주세요.");
    }
  }
);

/**
 * =================================================================
 * 🚨 [수정] 픽업 전 '웰컴 스낵' 주문을 영구 삭제하는 함수 (버그 수정)
 * =================================================================
 */
export const deleteUnclaimedWelcomeSnacks = onRequest(
  { region: "asia-northeast3", timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    try {
      logger.warn("🚨 [데이터 삭제 스크립트] 픽업 전 웰컴 스낵 주문 삭제 프로세스 시작...");

      const ordersRef = db.collection("orders");
      const querySnapshot = await ordersRef
        .where("status", "in", ["RESERVED", "PREPAID"])
        .get();

      if (querySnapshot.empty) {
        const message = "✅ 'RESERVED' 또는 'PREPAID' 상태의 주문이 없습니다. 삭제할 데이터가 없습니다.";
        logger.info(message);
        res.status(200).send(message);
        return;
      }

      let batch = db.batch();
      let deleteCount = 0;
      const MAX_BATCH_SIZE = 499;

      logger.info(`🔍 ${querySnapshot.size}개의 '픽업 전' 주문을 대상으로 검사 시작...`);

      for (const doc of querySnapshot.docs) {
        const order = doc.data() as Order;
        
        const isWelcomeSnackOrder = order.items?.some(
          (item) => item.productId === "GIFT_WELCOME_SNACK"
        );

        if (isWelcomeSnackOrder) {
          batch.delete(doc.ref);
          deleteCount++;
          logger.info(`  🗑️  삭제 대상 추가: 주문 ID ${doc.id}`);

          if (deleteCount > 0 && deleteCount % MAX_BATCH_SIZE === 0) {
            await batch.commit();
            logger.warn(`🔥 ${deleteCount}개의 주문을 삭제했습니다. 다음 배치를 계속합니다...`);
            // ✅ [수정] 처리가 끝난 후, 다음 작업을 위해 새로운 batch를 생성합니다.
            batch = db.batch(); 
          }
        }
      }

      // 남은 삭제 작업이 있다면 최종 실행
      if (deleteCount > 0 && deleteCount % MAX_BATCH_SIZE !== 0) {
        await batch.commit();
      }

      if (deleteCount > 0) {
        const successMessage = `✅ 성공: 총 ${deleteCount}개의 픽업 전 '웰컴 스낵' 주문을 영구적으로 삭제했습니다.`;
        logger.info(successMessage);
        res.status(200).send(successMessage);
      } else {
        const message = "✅ '픽업 전' 상태인 웰컴 스낵 주문을 찾을 수 없습니다. 삭제할 항목이 없습니다.";
        logger.info(message);
        res.status(200).send(message);
      }

    } catch (error) {
      logger.error("deleteUnclaimedWelcomeSnacks 함수 실행 중 심각한 오류 발생", error);
      res.status(500).send("❌ 오류가 발생했습니다. Functions 로그를 확인해주세요.");
    }
  }
);