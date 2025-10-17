// functions/src/triggers/products.ts

import { onDocumentWritten, onDocumentUpdated } from "firebase-functions/v2/firestore";
import type { FirestoreEvent, Change, QueryDocumentSnapshot } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { sendAlimtalk } from "../utils/nhnApi.js";
import { createNotification } from "../utils/notificationService.js";
// ✅ [수정] UniversalTimestamp 타입을 명시적으로 가져옵니다.
import type { Order, UserDocument, Product, UniversalTimestamp } from "@/shared/types";

// =================================================================
// 📌 기존 함수 (수정 없음)
// =================================================================

export const onProductWrite = onDocumentWritten("products/{productId}", async (event) => {
    const productId = event.params.productId;
    const productDataAfter = event.data?.after.data();
    const productDataBefore = event.data?.before.data();

    logger.info(`Product ${productId} was written.`);

    if (productDataAfter) {
        const encoreCountAfter = productDataAfter.encoreCount || 0;
        const encoreCountBefore = productDataBefore?.encoreCount || 0;
        
        if (encoreCountAfter >= 10 && encoreCountBefore < 10) {
            logger.info(`Product ${productId} reached ${encoreCountAfter} encore requests. Sending notifications.`);
        }
    }
    return;
});


// =================================================================
// 📌 신규 추가 함수 (오류 수정됨)
// =================================================================

// ✅ [수정] UniversalTimestamp 타입을 받도록 수정합니다.
const formatDate = (timestamp: UniversalTimestamp): string => {
  // UniversalTimestamp의 두 타입(Admin/Client) 모두 toDate() 메소드를 가지고 있습니다.
  const date = (timestamp as any).toDate(); 
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
};

export const onProductUpdateSendArrivalChangeNotice = onDocumentUpdated(
  "products/{productId}",
  async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, { productId: string }>) => {
    
    const { productId } = event.params;
    const change = event.data;
    if (!change) {
      logger.warn(`Data for product ${productId} is undefined in onProductUpdate event.`);
      return;
    }

    const beforeData = change.before.data() as Product;
    const afterData = change.after.data() as Product;

    const beforeRounds = beforeData.salesHistory || [];
    const afterRounds = afterData.salesHistory || [];

    for (const afterRound of afterRounds) {
      const beforeRound = beforeRounds.find(r => r.roundId === afterRound.roundId);

      // ✅ [수정] isEqual 대신 toDate()로 변환 후 getTime()으로 비교하여 타입 문제를 해결합니다.
      if (beforeRound && afterRound.arrivalDate && beforeRound.arrivalDate && 
          (afterRound.arrivalDate as any).toDate().getTime() !== (beforeRound.arrivalDate as any).toDate().getTime()) {
        
        const roundId = afterRound.roundId;
        const productName = afterData.groupName || "주문 상품";
        // ✅ [오류 해결] 이제 formatDate는 UniversalTimestamp를 정상적으로 처리합니다.
        const formattedBeforeDate = formatDate(beforeRound.arrivalDate);
        const formattedAfterDate = formatDate(afterRound.arrivalDate);

        logger.info(`입고일 변경 감지 (상품ID: ${productId}, 회차ID: ${roundId})`, {
            productName,
            from: formattedBeforeDate,
            to: formattedAfterDate,
        });
        
        await sendNotificationsForRoundUpdate(productId, roundId, productName, formattedBeforeDate, formattedAfterDate);
      }
    }
  }
);

async function sendNotificationsForRoundUpdate(
    productId: string,
    roundId: string,
    productName: string,
    formattedBeforeDate: string,
    formattedAfterDate: string
) {
  try {
    const db = getFirestore();
    
    // 이 함수 내부 로직은 변경할 필요가 없습니다.
    const ordersSnapshot = await db.collection("orders")
      .where("items.productId", "==", productId) // 필드를 더 정확하게 지정하는 것이 좋습니다.
      .where("items.roundId", "==", roundId)
      .where("status", "in", ["RESERVED", "PREPAID"])
      .get();

    if (ordersSnapshot.empty) {
      logger.info(`입고일이 변경된 상품/회차(ID: ${productId}/${roundId})를 주문한 활성 사용자가 없습니다.`);
      return;
    }

    const notificationsToSend = new Map<string, { user: UserDocument }>();
    
    for (const doc of ordersSnapshot.docs) {
        const order = doc.data() as Order;
        if (!notificationsToSend.has(order.userId)) {
            const userDoc = await db.collection("users").doc(order.userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data() as UserDocument;
                if (userData.phone && userData.displayName) {
                  notificationsToSend.set(order.userId, { user: userData });
                }
            }
        }
    }

    if (notificationsToSend.size === 0) {
      logger.info("알림을 발송할 유효한 사용자가 없습니다.");
      return;
    }
    
    const templateCode = "ARRIVAL_DATE_CHANGE";
    
    for (const [userId, { user }] of notificationsToSend.entries()) {
      
      if (user.phone) {
        try {
            const templateVariables = {
                상품명: productName,
                기존입고일: formattedBeforeDate,
                변경입고일: formattedAfterDate,
            };
            await sendAlimtalk(user.phone, templateCode, templateVariables);
        } catch (error) {
            logger.error(`[Alimtalk] User ${userId} 발송 실패`, { error, productId, roundId });
        }
      }

      try {
          const inAppMessage = `[입고일 변경] 주문하신 '${productName}' 상품의 입고일이 ${formattedAfterDate}(으)로 변경되었습니다.`;
          await createNotification(userId, inAppMessage, {
              type: "PRODUCT_UPDATE",
              link: "/mypage/orders",
          });
      } catch (error) {
          logger.error(`[InApp] User ${userId} 알림 생성 실패`, { error, productId, roundId });
      }
    }

    logger.info(`입고일 변경 안내 완료. 총 ${notificationsToSend.size}명의 사용자에게 발송 시도했습니다. (상품ID: ${productId}, 회차ID: ${roundId})`);

  } catch (error) {
    logger.error(`상품/회차(ID: ${productId}/${roundId}) 입고일 변경 알림 발송 중 심각한 오류 발생:`, error);
  }
}