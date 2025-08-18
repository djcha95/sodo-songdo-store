// functions/src/scheduled/notifications.ts
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { sendAlimtalk } from "../utils/nhnApi.js";
import type { Order, UserDocument } from "../types.js";

const normalizeToDate = (value: unknown): Date | null => {
    if (!value) return null;
    const potentialTimestamp = value as Timestamp;
    if (typeof potentialTimestamp.toDate === 'function') {
        return potentialTimestamp.toDate();
    }
    if (value instanceof Date) {
        return value;
    }
    return null;
};

/**
 * @description 픽업 안내 알림톡 발송 로직 (테스트 및 스케줄링 모두 사용)
 * @param targetUserPhone 특정 사용자에게만 보낼 경우 전화번호 전달 (예: '+821012345678')
 */
export async function executePickupReminders(targetUserPhone: string | null = null) {
  const mode = targetUserPhone ? `테스트 실행 (대상: ${targetUserPhone})` : "정기 실행";
  logger.info(`[${mode}] 픽업 안내 알림톡 발송 작업을 시작합니다.`);
  
  try {
    const db = getFirestore();
    const now = new Date();
    const kstDateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const todayStart = new Date(`${kstDateString}T00:00:00.000+09:00`);
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = tomorrow;
    
    // ⚠️ 테스트 시에는 24시간 제한을 잠시 비활성화하거나 시간을 조절할 수 있습니다.
    // 여기서는 기존 로직을 유지합니다.
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    const ordersSnapshot = await db.collection("orders")
      .where("pickupDate", ">=", todayStart)
      .where("pickupDate", "<", tomorrowStart)
      .where("status", "in", ["RESERVED", "PREPAID"])
      .get();

    if (ordersSnapshot.empty) {
      logger.info(`[${mode}] 오늘 픽업 시작인 주문이 없습니다. 작업을 종료합니다.`);
      return;
    }
    
    const pickupsByUser = new Map<string, Order[]>();
    
    ordersSnapshot.forEach(doc => {
      const order = doc.data() as Order;
      // 24시간 이내 생성된 주문 건너뛰기 로직은 테스트 시에도 동일하게 적용
      const createdAt = normalizeToDate(order.createdAt);
      if (!targetUserPhone && createdAt && createdAt > twentyFourHoursAgo) {
        logger.info(`[SKIP] Order ${doc.id} was created recently, skipping reminder.`);
        return;
      }

      const existingOrders = pickupsByUser.get(order.userId) || [];
      pickupsByUser.set(order.userId, [...existingOrders, order]);
    });

    if (pickupsByUser.size === 0) {
      logger.info(`[${mode}] 발송할 리마인더가 없습니다. (최근 생성 주문 제외)`);
      return;
    }

    let sentCount = 0;
    for (const [userId, userOrders] of pickupsByUser.entries()) {
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) continue;
      const userData = userDoc.data() as UserDocument;
      if (!userData?.phone || !userData.displayName) continue;

      // ✅ [핵심 수정] targetUserPhone이 지정되었고, 현재 사용자의 번호와 다르면 건너뜁니다.
      if (targetUserPhone && userData.phone.replace(/\D/g, '') !== targetUserPhone.replace(/\D/g, '')) {
          continue;
      }

      const allPickupItems = userOrders.flatMap(order => order.items);
      if (allPickupItems.length === 0) continue;

      const productListText = allPickupItems
          .map(item => `・${item.productName || '주문 상품'} ${item.quantity}개`)
          .join('\n');

      const templateCode = "STANDARD_PICKUP_STAR";
      const templateVariables = {
          고객명: userData.displayName,
          오늘픽업상품목록: productListText,
      };

      await sendAlimtalk(userData.phone, templateCode, templateVariables);
      sentCount++;
    }

    logger.info(`[${mode}] 총 ${sentCount}건의 픽업 안내 알림톡 발송을 완료했습니다.`);
  } catch (error) {
    logger.error(`[${mode}] 픽업 안내 알림톡 발송 중 오류 발생:`, error);
  }
}

// 기존 스케줄 함수는 분리된 로직을 호출하는 방식으로 변경
export const sendPickupReminders = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
  },
  async (context: ScheduledEvent) => {
    // 인자 없이 호출하여 모든 사용자를 대상으로 실행
    await executePickupReminders();
  });

// ... 이 파일의 나머지 함수들 (sendPrepaymentReminders, etc.) ...
export const sendPrepaymentReminders = onSchedule(
  {
    schedule: "every day 19:00",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
  },
  async (context: ScheduledEvent) => {
    logger.info("오후 7시: 선입금 최종 안내 알림톡 발송 작업을 시작합니다.");
    try {
        const db = getFirestore();
        const now = new Date();
        const kstDateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
        const todayStart = new Date(`${kstDateString}T00:00:00.000+09:00`);
        const todayEnd = new Date(`${kstDateString}T23:59:59.999+09:00`);

        const ordersSnapshot = await db.collection("orders")
            .where("pickupDeadlineDate", ">=", todayStart)
            .where("pickupDeadlineDate", "<=", todayEnd)
            .where("status", "==", "RESERVED")
            .get();

        if (ordersSnapshot.empty) {
            logger.info("오늘 픽업 마감 예정인 미수령 주문이 없습니다. 작업을 종료합니다.");
            return;
        }

        const remindersByUser = new Map<string, Order[]>();
        ordersSnapshot.forEach(doc => {
            const order = doc.data() as Order;
            const existingOrders = remindersByUser.get(order.userId) || [];
            remindersByUser.set(order.userId, [...existingOrders, order]);
        });

        for (const [userId, orders] of remindersByUser.entries()) {
            const userDoc = await db.collection("users").doc(userId).get();
            if (!userDoc.exists) continue;
            const userData = userDoc.data() as UserDocument;
            if (!userData?.phone || !userData.displayName) continue;

            const allItems = orders.flatMap(order => order.items);
            
            const productList = allItems
                .map(item => `・${item.productName || '주문 상품'} ${item.quantity}개`)
                .join('\n');
            const totalAmount = orders.reduce((sum, order) => sum + order.totalPrice, 0);

            const templateCode = "PREPAYMENT_GUIDE_URG";
            const templateVariables: { [key: string]: string } = {
                고객명: userData.displayName,
                상품목록: productList,
                총결제금액: totalAmount.toString(),
            };
            
            await sendAlimtalk(userData.phone, templateCode, templateVariables);
        }

        logger.info(`${remindersByUser.size}명의 사용자에게 선입금 최종 안내 알림톡 발송을 완료했습니다.`);
    } catch (error) {
        logger.error("오후 7시 선입금 안내 알림톡 발송 중 오류 발생:", error);
    }
  });

export const sendFuturePickupConfirmations = onSchedule(
  {
    schedule: "every day 13:00",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
  },
  async (context: ScheduledEvent) => {
    const now = new Date();
    const dayOfWeek = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' });

    if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') {
        logger.info("주말(토/일)에는 미래 픽업 확정 알림을 발송하지 않습니다.");
        return;
    }

    logger.info("오후 1시: 미래 픽업 예약 확정 알림톡 발송 작업을 시작합니다.");

    try {
        const db = getFirestore();

        const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        const rangeEnd = kstNow;
        let rangeStart = new Date(kstNow.getTime() - (24 * 60 * 60 * 1000));

        if (dayOfWeek === 'Mon') {
            rangeStart = new Date(kstNow.getTime() - (72 * 60 * 60 * 1000));
        }
        
        const todayStart = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());
        const tomorrow = new Date(todayStart);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStart = tomorrow;

        const ordersSnapshot = await db.collection("orders")
            .where("createdAt", ">=", rangeStart)
            .where("createdAt", "<", rangeEnd)
            .where("pickupDate", ">=", tomorrowStart)
            .where("status", "in", ["RESERVED", "PREPAID"])
            .get();

        if (ordersSnapshot.empty) {
            logger.info("알림을 보낼 미래 픽업 주문이 없습니다.");
            return;
        }

        const confirmationsByUser = new Map<string, Order[]>();
        ordersSnapshot.forEach(doc => {
            const order = doc.data() as Order;
            const existingOrders = confirmationsByUser.get(order.userId) || [];
            confirmationsByUser.set(order.userId, [...existingOrders, order]);
        });

        for (const [userId, userOrders] of confirmationsByUser.entries()) {
            const userDoc = await db.collection("users").doc(userId).get();
            if (!userDoc.exists) continue;
            const userData = userDoc.data() as UserDocument;
            if (!userData?.phone || !userData.displayName) continue;

            const allItems = userOrders.flatMap(order => order.items);
            const productListText = allItems
                .map(item => `・${item.productName || '주문 상품'} ${item.quantity}개`)
                .join('\n');
            
            const earliestPickupDate = userOrders
                .map(order => (order.pickupDate as Timestamp).toDate())
                .reduce((earliest, current) => current < earliest ? current : earliest);

            const templateCode = "ORD_CONFIRM_FUTURE";
            const templateVariables = {
                고객명: userData.displayName,
                상품목록: productListText,
                픽업시작일: earliestPickupDate.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }),
            };

            await sendAlimtalk(userData.phone, templateCode, templateVariables);
        }
        
        logger.info(`${confirmationsByUser.size}명의 사용자에게 미래 픽업 예약 확정 알림톡을 발송했습니다.`);
    } catch (error) {
        logger.error("미래 픽업 예약 확정 알림톡 발송 중 오류 발생:", error);
    }
  }
);