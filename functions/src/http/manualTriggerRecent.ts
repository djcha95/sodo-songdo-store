// functions/src/http/manualTriggerRecent.ts
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { sendAlimtalk } from "../utils/nhnApi.js";
import { admin } from "../firebase/admin.js";
import type { Order, UserDocument } from "@/shared/types";

// ✅ [보안 강화] 관리자 권한 검증 함수
const checkAdmin = async (request: any): Promise<boolean> => {
    if (!request.headers.authorization || !request.headers.authorization.startsWith('Bearer ')) {
        return false;
    }
    const idToken = request.headers.authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userRole = decodedToken.role;
        return userRole === 'admin' || userRole === 'master';
    } catch (error) {
        logger.error("Auth token verification failed:", error);
        return false;
    }
};

export const manualSendRecentReminders = onRequest(
  {
    region: "asia-northeast3",
    secrets: ["NHN_APP_KEY", "NHN_SECRET_KEY", "NHN_SENDER_KEY"],
  },
  async (req, res) => {
    // ✅ [보안 강화] 관리자 권한 검증
    const isAdmin = await checkAdmin(req);
    if (!isAdmin) {
        logger.error("Permission denied. Admin role required for manualSendRecentReminders.");
        res.status(403).send("Permission denied. Admin role required.");
        return;
    }
    
    logger.info("특수문자 포함 고객 대상 리마인더 재발송을 시작합니다.");
    try {
      const db = getFirestore();
      const now = new Date();
      const kstDateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      const todayStart = new Date(`${kstDateString}T00:00:00.000+09:00`);
      const tomorrow = new Date(todayStart);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = tomorrow;
      const twentyFourAndHalfHoursAgo = new Date(now.getTime() - (24.5 * 60 * 60 * 1000));

      const ordersSnapshot = await db.collection("orders")
        .where("pickupDate", ">=", todayStart)
        .where("pickupDate", "<", tomorrowStart)
        .where("status", "in", ["RESERVED", "PREPAID"])
        .where("createdAt", ">=", Timestamp.fromDate(twentyFourAndHalfHoursAgo))
        .get();

      if (ordersSnapshot.empty) {
        const message = "발송 대상(24.5시간 내 생성된 오늘 픽업 주문)이 없습니다.";
        logger.info(message);
        res.status(200).send(message);
        return;
      }

      const pickupsByUser = new Map<string, Order[]>();
      ordersSnapshot.forEach(doc => {
        const order = doc.data() as Order;
        const existingOrders = pickupsByUser.get(order.userId) || [];
        pickupsByUser.set(order.userId, [...existingOrders, order]);
      });

      const TRUNCATE_LENGTH = 6;
      let sentCount = 0;
      let skippedCount = 0;

      for (const [userId, userOrders] of pickupsByUser.entries()) {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) continue;
        const userData = userDoc.data() as UserDocument;
        if (!userData?.phone || !userData.displayName) continue;

        // ✅ [요청사항 반영] 특수문자를 찾는 정규식
        const specialCharRegex = /[^ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\s]/;

        // ✅ [요청사항 반영] 고객명에 특수문자가 포함된 경우에만 발송을 진행합니다.
        if (!specialCharRegex.test(userData.displayName)) {
            logger.info(`[SKIP] ${userData.displayName}님은 이름에 특수문자가 없어 건너뜁니다.`);
            skippedCount++;
            continue;
        }

        logger.info(`[SEND] ${userData.displayName}님은 이름에 특수문자가 있어 재발송을 시도합니다.`);

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
        
        const sanitizedDisplayName = userData.displayName.replace(specialCharRegex, '');

        const templateVariables = {
          고객명: sanitizedDisplayName,
          오늘픽업상품목록: productListText,
        };

        await sendAlimtalk(userData.phone, templateCode, templateVariables);
        sentCount++;
      }

      const successMessage = `총 ${sentCount}건의 재발송을 완료했습니다. (${skippedCount}건은 건너뜀)`;
      logger.info(successMessage);
      res.status(200).send(successMessage);
    } catch (error) {
      const errorMessage = "최근 주문 리마인더 발송 중 오류가 발생했습니다.";
      logger.error(errorMessage, error);
      res.status(500).send(errorMessage);
    }
  }
);