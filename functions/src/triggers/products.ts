// functions/src/triggers/products.ts

// ✅ [오류 수정 1] onUpdate 대신 onDocumentUpdated를 import 합니다.
import { onDocumentWritten, onDocumentUpdated } from "firebase-functions/v2/firestore";
import type { FirestoreEvent, Change, QueryDocumentSnapshot } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { sendAlimtalk } from "../utils/nhnApi.js";
// ✅ [오류 수정] 실제 파일 위치에 맞게 import 경로를 수정합니다.
import { createNotification } from "../utils/notificationService.js"; 
// ✅ [오류 수정 5] 사용하지 않는 SalesRound 타입을 import에서 제거합니다.
import type { Order, UserDocument, Product } from "../types.js";

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

const formatDate = (timestamp: Timestamp): string => {
  const date = timestamp.toDate();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
};

// ✅ [오류 수정 1, 3] onUpdate를 onDocumentUpdated로 변경하고, event 파라미터에 정확한 타입을 지정합니다.
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

      if (beforeRound && afterRound.arrivalDate && beforeRound.arrivalDate && !afterRound.arrivalDate.isEqual(beforeRound.arrivalDate)) {
        
        const roundId = afterRound.roundId;
        const productName = afterData.groupName || "주문 상품";
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
    
    const ordersSnapshot = await db.collection("orders")
      .where("productIds", "array-contains", productId)
      .where("roundIds", "array-contains", roundId)
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
      
      // ✅ [오류 수정 4] user.phone이 null일 가능성을 배제하기 위해 한 번 더 확인합니다.
      if (user.phone) {
        // 1. 알림톡 발송
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

      // 2. 앱 내 알림 생성
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