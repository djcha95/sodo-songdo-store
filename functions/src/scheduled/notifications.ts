// functions/src/scheduled/notifications.ts
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { sendAlimtalk } from "../utils/nhnApi.js";
import type { Order, OrderItem, UserDocument } from "../types.js";

// ✅ [최종 수정] FieldValue 타입을 포함한 모든 타입을 안전하게 처리하도록 함수를 개선합니다.
const normalizeToDate = (value: unknown): Date | null => {
    // 값이 null이거나 undefined이면 null 반환
    if (!value) {
        return null;
    }

    // value를 Timestamp로 간주하고 toDate 함수가 있는지 확인 (덕 타이핑)
    const potentialTimestamp = value as Timestamp;
    if (typeof potentialTimestamp.toDate === 'function') {
        return potentialTimestamp.toDate();
    }

    // 이미 JavaScript Date 객체인지 확인
    if (value instanceof Date) {
        return value;
    }
    
    // 위 두 경우에 해당하지 않으면(예: FieldValue) 날짜로 변환할 수 없으므로 null 반환
    return null;
};

type PickupInfo = {
  item: OrderItem;
  pickupDate: Timestamp | Date;
  deadlineDate: Timestamp | Date | null;
};

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
      
      const kstDateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      const todayStart = new Date(`${kstDateString}T00:00:00.000+09:00`);
      
      const tomorrow = new Date(todayStart);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = tomorrow;
      
      const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      const ordersSnapshot = await db.collection("orders")
        .where("pickupDate", ">=", todayStart)
        .where("pickupDate", "<", tomorrowStart)
        .where("status", "in", ["RESERVED", "PREPAID"])
        .get();

      if (ordersSnapshot.empty) {
        logger.info("오늘 픽업 시작인 주문이 없습니다. 작업을 종료합니다.");
        return;
      }

      const pickupsByUser = new Map<string, PickupInfo[]>();
      
      ordersSnapshot.forEach(doc => {
        const order = doc.data() as Order;
        // 이제 이 호출은 FieldValue 타입도 안전하게 처리합니다.
        const createdAt = normalizeToDate(order.createdAt);

        if (createdAt && createdAt > twentyFourHoursAgo) {
          logger.info(`[SKIP] Order ${doc.id} was created recently, skipping reminder.`);
          return;
        }

        if (!order.pickupDate) {
            logger.warn(`[SKIP] Order ${doc.id} is missing pickupDate.`);
            return;
        }
        
        const itemsWithDates: PickupInfo[] = order.items.map(item => ({
            item: item,
            pickupDate: order.pickupDate,
            deadlineDate: order.pickupDeadlineDate ?? null,
        }));
        
        const existingItems = pickupsByUser.get(order.userId) || [];
        pickupsByUser.set(order.userId, [...existingItems, ...itemsWithDates]);
      });

      if (pickupsByUser.size === 0) {
        logger.info("모든 픽업 예정 주문이 최근에 생성되어, 발송할 리마인더가 없습니다.");
        return;
      }

      for (const [userId, pickupInfos] of pickupsByUser.entries()) {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) continue;
        const userData = userDoc.data() as UserDocument;
        if (!userData?.phone || !userData.displayName) continue;
        
        const urgentPickupInfos = pickupInfos.filter(info => {
            const pickupDate = normalizeToDate(info.pickupDate);
            const deadlineDate = normalizeToDate(info.deadlineDate);
            return pickupDate && deadlineDate && pickupDate.toDateString() === deadlineDate.toDateString();
        });
        const standardPickupInfos = pickupInfos.filter(info => !urgentPickupInfos.includes(info));

        let templateCode = "";
        const templateVariables: { [key: string]: string } = { 고객명: userData.displayName };

        if (urgentPickupInfos.length > 0) {
          templateCode = "URGENT_PICKUP_TODAY";
          templateVariables.오늘날짜 = `${now.getMonth() + 1}월 ${now.getDate()}일`;
          templateVariables.긴급상품목록 = urgentPickupInfos.map(info => `${info.item.itemName} ${info.item.quantity}개`).join('\n');
          templateVariables.추가안내 = standardPickupInfos.length > 0 ? `이 외에 ${standardPickupInfos.length}건의 다른 픽업 상품도 오늘부터 수령 가능합니다.` : '';

        } else if (standardPickupInfos.length > 0) {
          templateCode = "STANDARD_PICKUP_STAR";
          const earliestDeadline = new Date(Math.min(...standardPickupInfos.map(info => (normalizeToDate(info.deadlineDate) ?? new Date()).getTime())));
          const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
          
          templateVariables.대표상품명 = standardPickupInfos[0].item.productName || '주문 상품';
          templateVariables.추가상품갯수 = (standardPickupInfos.length - 1).toString();
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

            const representativeItemName = items.length > 0 ? items[0].productName : '주문 상품';
            const otherItemsCount = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
            
            const templateCode = "PREPAYMENT_GUIDE_URG";
            const templateVariables: { [key: string]: string } = {
                고객명: userData.displayName,
                상품명: `${representativeItemName}${otherItemsCount}`,
            };

            await sendAlimtalk(userData.phone, templateCode, templateVariables);
        }
        logger.info(`${remindersByUser.size}명의 사용자에게 선입금 최종 안내 알림톡 발송을 완료했습니다.`);

    } catch (error) {
        logger.error("오후 7시 선입금 안내 알림톡 발송 중 오류 발생:", error);
    }
  });