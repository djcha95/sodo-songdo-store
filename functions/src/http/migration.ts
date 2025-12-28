// functions/src/http/migration.ts

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, admin } from "../firebase/admin.js";
import { Timestamp } from "firebase-admin/firestore";
import type { Order, OrderItem, Product } from "@/shared/types";

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

/**
 * =================================================================
 * ✅ [최종 마감일 보정] 모든 분할된 주문의 픽업 마감일을 비즈니스 규칙에 따라 재계산하는 함수
 * =================================================================
 */
export const bulkApplyDeadlineLogic = onRequest(
  { region: "asia-northeast3", timeoutSeconds: 600, memory: "512MiB" },
  async (req, res) => {
    // ✅ [보안 강화] 관리자 권한 검증
    const isAdmin = await checkAdmin(req);
    if (!isAdmin) {
        logger.error("Permission denied. Admin role required for bulkApplyDeadlineLogic.");
        res.status(403).send("Permission denied. Admin role required.");
        return;
    }
    
    logger.info("Starting to apply pickup deadline logic to split orders.");

    const productCache = new Map<string, Product>();

    try {
      // 이전에 분할된 주문들만 대상으로 함
      const splitOrdersQuery = db.collection("orders").where("splitFrom", "!=", null);
      const snapshot = await splitOrdersQuery.get();

      if (snapshot.empty) {
        res.status(200).send("No split orders found to process.");
        return;
      }
      logger.info(`Found ${snapshot.size} split orders to check.`);
      
      const batch = db.batch();
      let fixedCount = 0;

      for (const doc of snapshot.docs) {
        const order = doc.data() as Order;
        const orderPickupDate = order.pickupDate as Timestamp;

        if (!Array.isArray(order.items) || order.items.length !== 1 || !orderPickupDate) {
            continue;
        }
        
        const item = order.items[0] as OrderItem;
        const { productId } = item;
        if (!productId) continue;

        // 1. 상품 정보 조회 (캐시 활용)
        let productData = productCache.get(productId);
        if (!productData) {
            const productSnap = await db.collection("products").doc(productId).get();
            if (productSnap.exists) {
                productData = productSnap.data() as Product;
                productCache.set(productId, productData);
            }
        }
        // 상품 정보가 없거나 storageType이 없으면 건너뛰기
        if (!productData || !productData.storageType) continue;

        // 2. 비즈니스 규칙에 따라 새로운 마감일 계산
        let newDeadlineDate: Timestamp;
        const pickupDateObj = orderPickupDate.toDate();

        if (productData.storageType === 'COLD') {
            // '냉장'이면 당일 픽업
            newDeadlineDate = orderPickupDate;
        } else {
            // '실온' 또는 '냉동'이면 +1일
            const nextDay = new Date(pickupDateObj.getTime());
            nextDay.setDate(nextDay.getDate() + 1);
            newDeadlineDate = Timestamp.fromDate(nextDay);
        }

        // 3. 현재 마감일과 다를 경우에만 업데이트
        const currentDeadlineDate = order.pickupDeadlineDate as Timestamp | null;
        if (!currentDeadlineDate || currentDeadlineDate.toMillis() !== newDeadlineDate.toMillis()) {
            batch.update(doc.ref, { pickupDeadlineDate: newDeadlineDate });
            fixedCount++;
        }
      }

      if (fixedCount === 0) {
        res.status(200).send("All split orders already have correct deadlines. No updates needed.");
        return;
      }

      await batch.commit();

      const summary = `Deadline logic applied. ${fixedCount} orders have been updated.`;
      logger.info(summary);
      res.status(200).send(summary);

    } catch (error) {
      logger.error("An error occurred during the deadline logic application:", error);
      res.status(500).send("An error occurred during the process.");
    }
  }
);