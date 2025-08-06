// functions/src/scheduled/notifications.ts
import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { sendAlimtalk } from "../utils/nhnApi.js";
import type { Order, OrderItem, UserDocument } from "../types.js";

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

        const todayString = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
        
        const todayDeadlineInfos = pickupInfos.filter(info => {
            const deadline = normalizeToDate(info.deadlineDate);
            return deadline && deadline.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) === todayString;
        });

        const futureDeadlineInfos = pickupInfos.filter(info => !todayDeadlineInfos.includes(info));

        if (todayDeadlineInfos.length === 0 && futureDeadlineInfos.length === 0) {
            continue;
        }

        let todayDeadlineText = "";
        if (todayDeadlineInfos.length > 0) {
            const productList = todayDeadlineInfos
                .map(info => `・${info.item.productName || info.item.itemName} ${info.item.quantity}개`)
                .join('\n');
            todayDeadlineText = `🚨 오늘 꼭 찾아가세요! (오늘 저녁 8시 마감)\n${productList}`;
        }

        let futureDeadlineText = "";
        if (futureDeadlineInfos.length > 0) {
            const productList = futureDeadlineInfos
                .map(info => `・${info.item.productName || info.item.itemName} ${info.item.quantity}개`)
                .join('\n');

            const earliestDeadline = new Date(Math.min(
                ...futureDeadlineInfos
                    .map(info => normalizeToDate(info.deadlineDate)?.getTime())
                    .filter((time): time is number => time !== undefined)
            ));
            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            const deadlineStr = `${earliestDeadline.getMonth() + 1}월 ${earliestDeadline.getDate()}일(${weekdays[earliestDeadline.getDay()]})`;

            futureDeadlineText = `🛍️ 오늘부터 여유롭게 찾아가세요 (픽업기한: ~${deadlineStr}까지)\n${productList}`;
        }
        
        const templateCode = "STANDARD_PICKUP_STAR";
        const templateVariables: { [key: string]: string } = {
            고객명: userData.displayName,
            오늘마감상품목록: todayDeadlineText,
            일반픽업상품목록: futureDeadlineText,
        };

        if (todayDeadlineText && !futureDeadlineText) {
            templateVariables.오늘마감상품목록 = todayDeadlineText.trim();
        }
        if (!todayDeadlineText && futureDeadlineText) {
            templateVariables.일반픽업상품목록 = futureDeadlineText.trim();
        }

        await sendAlimtalk(userData.phone, templateCode, templateVariables);
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
            // ✅ [수정] 템플릿에 맞춰 변수명을 '상품목록'과 '총선입금액'으로 수정했습니다.
            const templateVariables: { [key: string]: string } = {
                고객명: userData.displayName,
                상품목록: productList,
                총선입금액: totalAmount.toString(),
            };
            
            await sendAlimtalk(userData.phone, templateCode, templateVariables);
        }

        logger.info(`${remindersByUser.size}명의 사용자에게 선입금 최종 안내 알림톡 발송을 완료했습니다.`);
    } catch (error) {
        logger.error("오후 7시 선입금 안내 알림톡 발송 중 오류 발생:", error);
    }
  });