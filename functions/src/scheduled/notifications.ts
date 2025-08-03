// functions/src/scheduled/notifications.ts
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { sendAlimtalk } from "../utils/nhnApi.js";
import type { Order, OrderItem, UserDocument } from "../types.js";

export const sendPickupReminders = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
  },
  async (context: ScheduledEvent) => {
    logger.info("오전 9시: 픽업 안내 알림톡 발송 작업을 시작합니다.");

    try {
      const db = getFirestore();
      
      const now = new Date();
      
      // ✅ --- [수정] 시간 계산 로직 단순화 및 표준화 ---
      // KST 기준으로 '오늘'의 시작과 '내일'의 시작을 계산합니다.
      const kstDateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      const todayStart = new Date(`${kstDateString}T00:00:00.000+09:00`);
      
      const tomorrow = new Date(todayStart);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = tomorrow;
      // ✅ --- 수정 끝 ---
      
      const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      const ordersSnapshot = await db.collection("orders")
        // ✅ [수정] 쿼리 조건을 '오늘 시작' ~ '내일 시작 전'으로 변경하여 안정성 확보
        .where("pickupDate", ">=", todayStart)
        .where("pickupDate", "<", tomorrowStart)
        .where("status", "in", ["RESERVED", "PREPAID"])
        .get();

      if (ordersSnapshot.empty) {
        logger.info("오늘 픽업 시작인 주문이 없습니다. 작업을 종료합니다.");
        return;
      }

      const pickupsByUser = new Map<string, OrderItem[]>();
      
      ordersSnapshot.forEach(doc => {
        const order = doc.data() as Order;
        const createdAt = (order.createdAt as Timestamp)?.toDate();

        if (createdAt && createdAt > twentyFourHoursAgo) {
          logger.info(`[SKIP] Order ${doc.id} was created recently, skipping reminder.`);
          return;
        }
        
        const existingItems = pickupsByUser.get(order.userId) || [];
        pickupsByUser.set(order.userId, [...existingItems, ...order.items]);
      });

      if (pickupsByUser.size === 0) {
        logger.info("모든 픽업 예정 주문이 최근에 생성되어, 발송할 리마인더가 없습니다.");
        return;
      }

      for (const [userId, items] of pickupsByUser.entries()) {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) continue;
        const userData = userDoc.data() as UserDocument;
        if (!userData?.phone || !userData.displayName) continue;
        
        const urgentItems = items.filter(item => {
            const pickupDate = (item.pickupDate as Timestamp)?.toDate();
            const deadlineDate = (item.deadlineDate as Timestamp)?.toDate();
            return pickupDate && deadlineDate && pickupDate.toDateString() === deadlineDate.toDateString();
        });
        const standardItems = items.filter(item => !urgentItems.includes(item));

        let templateCode = "";
        const templateVariables: { [key: string]: string } = { 고객명: userData.displayName };

        if (urgentItems.length > 0) {
          templateCode = "URGENT_PICKUP_TODAY";
          templateVariables.오늘날짜 = `${now.getMonth() + 1}월 ${now.getDate()}일`;
          templateVariables.긴급상품목록 = urgentItems.map(item => `${item.itemName} ${item.quantity}개`).join('\n');
          templateVariables.추가안내 = standardItems.length > 0 ? `이 외에 ${standardItems.length}건의 다른 픽업 상품도 오늘부터 수령 가능합니다.` : '';

        } else if (standardItems.length > 0) {
          templateCode = "STANDARD_PICKUP_STAR";
          const earliestDeadline = new Date(Math.min(...standardItems.map(item => ((item.deadlineDate as Timestamp)?.toDate() ?? new Date()).getTime())));
          const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
          
          templateVariables.대표상품명 = standardItems[0].productName || '주문 상품';
          templateVariables.추가상품갯수 = (standardItems.length - 1).toString();
          templateVariables.마감일 = `${earliestDeadline.getMonth() + 1}월 ${earliestDeadline.getDate()}일(${weekdays[earliestDeadline.getDay()]})`;
        }

        if (templateCode) {
          await sendAlimtalk(userData.phone, templateCode, templateVariables);
        }
      }
      logger.info(`${pickupsByUser.size}명의 사용자에게 픽업 안내 알림톡 발송을 완료했습니다.`);
    } catch (error) {
      logger.error("오전 9시 픽업 안내 알림톡 발송 중 오류 발생:", error);
    }
  });

export const sendPrepaymentReminders = onSchedule(
  {
    schedule: "every day 19:00",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
  },
  async (context: ScheduledEvent) => {
    logger.info("오후 7시: 선입금 최종 안내 알림톡 발송 작업을 시작합니다.");
    
    try {
        const db = getFirestore();
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

        const ordersSnapshot = await db.collection("orders")
            .where("pickupDeadlineDate", ">=", todayStart)
            .where("pickupDeadlineDate", "<=", todayEnd)
            .where("status", "==", "RESERVED")
            .get();

        if (ordersSnapshot.empty) {
            logger.info("오늘 픽업 마감 예정인 미수령 주문이 없습니다. 작업을 종료합니다.");
            return;
        }

        const remindersByUser = new Map<string, OrderItem[]>();
        ordersSnapshot.forEach(doc => {
            const order = doc.data() as Order;
            const existingItems = remindersByUser.get(order.userId) || [];
            remindersByUser.set(order.userId, [...existingItems, ...order.items]);
        });

        for (const [userId, items] of remindersByUser.entries()) {
            const userDoc = await db.collection("users").doc(userId).get();
            if (!userDoc.exists) continue;
            const userData = userDoc.data() as UserDocument;
            if (!userData?.phone || !userData.displayName) continue;
            
            const templateCode = "PREPAYMENT_GUIDE_URG";
            const templateVariables: { [key: string]: string } = {
                고객명: userData.displayName,
                대표상품명: items[0].productName || '주문 상품',
                추가상품갯수: (items.length - 1).toString(),
            };

            await sendAlimtalk(userData.phone, templateCode, templateVariables);
        }
        logger.info(`${remindersByUser.size}명의 사용자에게 선입금 최종 안내 알림톡 발송을 완료했습니다.`);

    } catch (error) {
        logger.error("오후 7시 선입금 안내 알림톡 발송 중 오류 발생:", error);
    }
  });