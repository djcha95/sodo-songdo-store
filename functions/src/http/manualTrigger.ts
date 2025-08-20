// functions/src/http/manualTrigger.ts

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { dbAdmin as db } from "../firebase/admin.js";
import { Timestamp } from "firebase-admin/firestore";
import { executePickupReminders } from "../scheduled/notifications.js";
import type { Order, UserDocument, LoyaltyTier, PointLog } from "../types.js";

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
    if (userRole !== 'admin' && userRole !== 'master') {
        throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }

    logger.info(`[Data-Reaggregation] Started by admin: ${request.auth.uid}`);

    try {
        const usersSnapshot = await db.collection('users').get();
        let processedUserCount = 0;
        const totalUsers = usersSnapshot.size;

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const originalUserData = userDoc.data() as UserDocument;

            const ordersSnapshot = await db.collection('orders').where('userId', '==', userId).get();
            const userOrders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

            let newPickupCount = 0;
            let newNoShowCount: number = 0; // 0.5 단위를 위해 number 타입으로 지정
            const newPointLogs: Omit<PointLog, 'id'>[] = [];

            for (const order of userOrders) {
                if (order.status === 'PICKED_UP') {
                    newPickupCount++;
                    const purchasePoints = Math.floor((order.totalPrice || 0) * 0.005);
                    const prepaidBonus = order.wasPrepaymentRequired ? 5 : 0;
                    const totalPoints = purchasePoints + prepaidBonus;
                    if (totalPoints > 0) {
                        newPointLogs.push({
                            amount: totalPoints,
                            reason: `[재계산] 구매 확정 (${order.id.slice(-6)})`,
                            createdAt: order.pickedUpAt || order.createdAt,
                            orderId: order.id,
                            expiresAt: null
                        });
                    }
                }

                if (order.status === 'NO_SHOW') {
                    newNoShowCount += 1;
                    newPointLogs.push({
                        amount: -100,
                        reason: `[재계산] 미수령 페널티 (${order.id.slice(-6)})`,
                        createdAt: order.canceledAt || Timestamp.now(),
                        orderId: order.id,
                        expiresAt: null,
                    });
                }
                
                if (order.status === 'LATE_CANCELED') {
                    newNoShowCount += 0.5;
                     newPointLogs.push({
                        amount: -50,
                        reason: `[재계산] 마감 임박 취소 (${order.id.slice(-6)})`,
                        createdAt: order.canceledAt || Timestamp.now(),
                        orderId: order.id,
                        expiresAt: null,
                    });
                }
            }
            
            const manualPointsAndLogs = (originalUserData.pointHistory || [])
                .filter(log => !log.orderId && (log.reason.includes('(수동)') || !log.reason.includes('구매 확정')));

            const manualPointsTotal = manualPointsAndLogs.reduce((sum, log) => sum + log.amount, 0);
            const recalculatedOrderPoints = newPointLogs.reduce((sum, log) => sum + log.amount, 0);
            
            const newTotalPoints = manualPointsTotal + recalculatedOrderPoints;
            const newTier = calculateTier(newPickupCount, newNoShowCount);
            
            const finalPointHistory = [
                ...manualPointsAndLogs.map(log => ({...log, reason: log.reason.replace('[재계산] ', '')})), // 기존 수동 로그
                ...newPointLogs // 재계산된 주문 관련 로그
            ].sort((a,b) => (b.createdAt as Timestamp).toMillis() - (a.createdAt as Timestamp).toMillis());


            const finalUpdateData = {
                pickupCount: newPickupCount,
                noShowCount: newNoShowCount,
                points: newTotalPoints,
                loyaltyTier: newTier,
                pointHistory: finalPointHistory, // 포인트 내역도 재구성하여 덮어쓰기
            };

            await db.collection('users').doc(userId).update(finalUpdateData);

            processedUserCount++;
            if (processedUserCount % 50 === 0) {
                logger.info(`[Data-Reaggregation] Progress: ${processedUserCount} / ${totalUsers} users processed.`);
            }
        }

        const successMessage = `[Data-Reaggregation] Success! Processed ${processedUserCount} users.`;
        logger.info(successMessage);
        return { success: true, message: successMessage };

    } catch (error) {
        logger.error("[Data-Reaggregation] An error occurred:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "데이터 재계산 중 오류가 발생했습니다.");
    }
});