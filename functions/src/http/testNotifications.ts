// functions/src/http/testNotifications.ts

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { sendAlimtalk } from "../utils/nhnApi.js";
// ✅ 1. [수정] OrderItem 타입을 명시적으로 가져옵니다.
import type { Order, UserDocument, OrderItem } from "../types.js";

/**
 * [테스트용] 선입금 안내 알림톡을 즉시 발송하는 HTTP 함수
 */
export const runPrepaymentRemindersNow = onRequest(
  {
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
    cors: true, // 테스트를 위해 모든 출처를 허용합니다.
  },
  async (request, response) => {
    logger.info("[Test] 선입금 최종 안내 알림톡 수동 발송을 시작합니다.");
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
            const message = "오늘 픽업 마감 예정인 미수령 주문이 없습니다. 작업을 종료합니다.";
            logger.info(message);
            response.status(200).send(message);
            return;
        }

        const remindersByUser = new Map<string, Order[]>();
        ordersSnapshot.forEach(doc => {
            const order = doc.data() as Order;
            if (order.userId !== "kakao:4299905050") {
                return;
            }
            const existingOrders = remindersByUser.get(order.userId) || [];
            remindersByUser.set(order.userId, [...existingOrders, order]);
        });

        if (remindersByUser.size === 0) {
            const message = "조건에 맞는 주문 중 테스트 대상(본인 userId)이 없습니다.";
            logger.info(message);
            response.status(200).send(message);
            return;
        }

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
        
        const successMessage = `${remindersByUser.size}명의 테스트 사용자에게 선입금 최종 안내 알림톡 발송을 완료했습니다.`;
        logger.info(successMessage);
        response.status(200).send(successMessage);

    } catch (error) {
        logger.error("[Test] 선입금 안내 알림톡 수동 발송 중 오류 발생:", error);
        response.status(500).send("오류가 발생했습니다. 자세한 내용은 로그를 확인하세요.");
    }
  }
);

/**
 * [테스트용] 픽업 당일 안내 알림톡을 즉시 발송하는 HTTP 함수
 */
/**
 * [테스트용] 픽업 당일 안내 알림톡을 즉시 발송하는 HTTP 함수
 */
export const runPickupReminderNow = onRequest(
  {
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
    cors: true,
  },
  async (request, response) => {
    logger.info("[Test] 픽업 당일 안내 알림톡 수동 발송을 시작합니다.");
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
        const message = "오늘 픽업 시작인 주문이 없습니다. 작업을 종료합니다.";
        logger.info(message);
        response.status(200).send(message);
        return;
      }
      
      const pickupsByUser = new Map<string, Order[]>();
      ordersSnapshot.forEach(doc => {
        const order = doc.data() as Order;
        if (order.userId !== "kakao:4299905050") { 
            return;
        }
        const existingItems = pickupsByUser.get(order.userId) || [];
        pickupsByUser.set(order.userId, [...existingItems, order]);
      });

      if (pickupsByUser.size === 0) {
        const message = "조건에 맞는 주문 중 테스트 대상(본인 userId)이 없습니다.";
        logger.info(message);
        response.status(200).send(message);
        return;
      }

      for (const [userId, userOrders] of pickupsByUser.entries()) {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) continue;
        const userData = userDoc.data() as UserDocument;
        if (!userData?.phone || !userData.displayName) continue;

        const allItemsWithDates = userOrders.flatMap(order => 
            order.items.map((item: OrderItem) => ({
                item: item,
                pickupDeadlineDate: order.pickupDeadlineDate
            }))
        );

        const todayString = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

        const todayDeadlineItems = allItemsWithDates.filter(info => {
            const deadline = (info.pickupDeadlineDate as any)?.toDate();
            return deadline && deadline.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) === todayString;
        });

        const futureDeadlineItems = allItemsWithDates.filter(info => !todayDeadlineItems.includes(info));
        
        // ✅ [수정] 변수 내용을 이모지나 추가 문구 없이 단순한 상품 목록으로 변경합니다.
        let todayDeadlineText = "";
        if (todayDeadlineItems.length > 0) {
            todayDeadlineText = todayDeadlineItems.map(info => `・${info.item.productName || '주문 상품'} ${info.item.quantity}개`).join('\n');
        }

        let futureDeadlineText = "";
        if (futureDeadlineItems.length > 0) {
            futureDeadlineText = futureDeadlineItems.map(info => `・${info.item.productName || '주문 상품'} ${info.item.quantity}개`).join('\n');
        }

        if (!todayDeadlineText && !futureDeadlineText) {
            const message = "알림톡을 보낼 상품 내역이 없습니다.";
            logger.info(message);
            response.status(200).send(message);
            continue; 
        }
        
        const templateVariables = {
            고객명: userData.displayName,
            오늘마감상품목록: todayDeadlineText,
            일반픽업상품목록: futureDeadlineText,
        };

        await sendAlimtalk(userData.phone, "STANDARD_PICKUP_STAR", templateVariables);
      }
      
      const successMessage = `${pickupsByUser.size}명의 테스트 사용자에게 픽업 당일 안내 알림톡 발송을 완료했습니다.`;
      logger.info(successMessage);
      response.status(200).send(successMessage);

    } catch (error) {
      logger.error("[Test] 픽업 당일 안내 알림톡 수동 발송 중 오류 발생:", error);
      response.status(500).send("오류가 발생했습니다. 자세한 내용은 로그를 확인하세요.");
    }
  }
);

/**
 * @description [테스트용] 미래 픽업 예약 확정 알림톡을 즉시 발송하는 HTTP 함수
 * 지난 5분 이내에 생성된 '미래 픽업' 건을 대상으로 합니다.
 */
export const runFuturePickupConfirmationsNow = onRequest(
  {
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
    cors: true, // 테스트를 위해 모든 출처를 허용합니다.
  },
  async (request, response) => {
    logger.info("[Test] 미래 픽업 확정 알림톡 수동 발송을 시작합니다.");

    try {
        const db = getFirestore();
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - (5 * 60 * 1000));
        
        // 픽업 시작일이 '미래'인 주문만 조회
        const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        const todayStart = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());
        const tomorrow = new Date(todayStart);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStart = tomorrow;

        // ✅ [핵심] 지난 5분 이내에 생성된, 픽업일이 내일 이후인 주문을 찾습니다.
        const ordersSnapshot = await db.collection("orders")
            .where("createdAt", ">=", fiveMinutesAgo)
            .where("createdAt", "<=", now)
            .where("pickupDate", ">=", tomorrowStart)
            .where("status", "in", ["RESERVED", "PREPAID"])
            .get();

        if (ordersSnapshot.empty) {
            const message = "지난 5분 내에 생성된 미래 픽업 주문이 없습니다.";
            logger.info(message);
            response.status(200).send(message);
            return;
        }

        const confirmationsByUser = new Map<string, Order[]>();
        ordersSnapshot.forEach(doc => {
            const order = doc.data() as Order;
            // 본인의 userId로 필터링 (필요 시 주석 처리)
            if (order.userId !== "kakao:4299905050") {
                return;
            }
            const existingOrders = confirmationsByUser.get(order.userId) || [];
            confirmationsByUser.set(order.userId, [...existingOrders, order]);
        });
        
        if (confirmationsByUser.size === 0) {
            const message = "조건에 맞는 주문 중 테스트 대상(본인 userId)이 없습니다.";
            logger.info(message);
            response.status(200).send(message);
            return;
        }

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
        
        const successMessage = `${confirmationsByUser.size}명의 사용자에게 미래 픽업 예약 확정 알림톡을 발송했습니다.`;
        logger.info(successMessage);
        response.status(200).send(successMessage);
    } catch (error) {
        logger.error("미래 픽업 예약 확정 테스트 중 오류 발생:", error);
        response.status(500).send("오류가 발생했습니다. 자세한 내용은 로그를 확인하세요.");
    }
  }
);