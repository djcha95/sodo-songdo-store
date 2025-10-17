// functions/src/scheduled/notifications.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { sendAlimtalk } from "../utils/nhnApi.js";
import type { Order, UserDocument } from "@/shared/types";

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
      const existingOrders = pickupsByUser.get(order.userId) || [];
      pickupsByUser.set(order.userId, [...existingOrders, order]);
    });

    if (pickupsByUser.size === 0) {
      logger.info(`[${mode}] 발송할 리마인더가 없습니다.`);
      return;
    }
    
    const TRUNCATE_LENGTH = 6;
    let sentCount = 0;
    for (const [userId, userOrders] of pickupsByUser.entries()) {
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) continue;
      const userData = userDoc.data() as UserDocument;
      if (!userData?.phone || !userData.displayName) continue;

      if (targetUserPhone && userData.phone.replace(/\D/g, '') !== targetUserPhone.replace(/\D/g, '')) {
          continue;
      }

      const allPickupItems = userOrders.flatMap(order => order.items);
      if (allPickupItems.length === 0) continue;
      
      let productListText: string;
      if (allPickupItems.length > 1) {
          const firstItemName = allPickupItems[0].productName || '주문 상품';
          const truncatedName = firstItemName.length > TRUNCATE_LENGTH ? firstItemName.substring(0, TRUNCATE_LENGTH) + "…" : firstItemName;
          const otherItemsCount = allPickupItems.length - 1;
          productListText = `・${truncatedName} 외 ${otherItemsCount}건`;
      } else if (allPickupItems.length === 1) {
          const item = allPickupItems[0];
          const productName = item.productName || '주문 상품';
          const truncatedName = productName.length > TRUNCATE_LENGTH ? productName.substring(0, TRUNCATE_LENGTH) + "…" : productName;
          productListText = `・${truncatedName} ${item.quantity}개`;
      } else {
          continue;
      }

      const templateCode = "STANDARD_PICKUP_STAR";
      
      // ✅ [수정] 새 템플릿에 맞게 '고객명' 변수를 제거합니다.
      const templateVariables = {
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

export const sendPickupReminders = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
  },
  async (context) => {
    await executePickupReminders();
  });

export const sendPrepaymentReminders = onSchedule(
  {
    schedule: "every day 19:00",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
  },
  async (context) => {
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
        
        const TRUNCATE_LENGTH = 6;
        for (const [userId, orders] of remindersByUser.entries()) {
            const userDoc = await db.collection("users").doc(userId).get();
            if (!userDoc.exists) continue;
            const userData = userDoc.data() as UserDocument;
            if (!userData?.phone || !userData.displayName) continue;

            const allItems = orders.flatMap((order) => order.items);
            
            let productList: string;
            if (allItems.length > 1) {
                const firstItemName = allItems[0].productName || '주문 상품';
                const truncatedName = firstItemName.length > TRUNCATE_LENGTH ? firstItemName.substring(0, TRUNCATE_LENGTH) + "…" : firstItemName;
                const otherItemsCount = allItems.length - 1;
                productList = `・${truncatedName} 외 ${otherItemsCount}건`;
            } else if (allItems.length === 1) {
                const item = allItems[0];
                const productName = item.productName || '주문 상품';
                const truncatedName = productName.length > TRUNCATE_LENGTH ? productName.substring(0, TRUNCATE_LENGTH) + "…" : productName;
                productList = `・${truncatedName} ${item.quantity}개`;
            } else {
                continue; 
            }
            
            const totalAmount = orders.reduce((sum, order) => sum + order.totalPrice, 0);

            const templateCode = "PREPAYMENT_GUIDE_URG";
            
            const sanitizedDisplayName = userData.displayName.replace(/[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\s]/g, '');

            const templateVariables = {
                고객명: sanitizedDisplayName,
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