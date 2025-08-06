// functions/src/triggers/products.ts

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
// ✅ [수정] 사용하지 않는 import 제거
// import { dbAdmin as db } from "../firebase/admin.js";
// import * as admin from "firebase-admin";

// 예시: 상품 문서가 생성되거나 업데이트될 때 실행되는 트리거 함수
export const onProductWrite = onDocumentWritten("products/{productId}", async (event) => {
    // 이 함수는 상품 데이터가 변경될 때마다 실행됩니다.
    // 예를 들어, 상품의 재고가 변경되면 관련 알림을 보내는 등의 로직을 여기에 추가할 수 있습니다.
    
    const productId = event.params.productId;
    const productDataAfter = event.data?.after.data();
    const productDataBefore = event.data?.before.data();

    logger.info(`Product ${productId} was written.`);

    // 예시 로직: 상품의 encoreCount가 특정 숫자를 넘으면 앵콜 가능 알림 보내기
    if (productDataAfter) {
        const encoreCountAfter = productDataAfter.encoreCount || 0;
        const encoreCountBefore = productDataBefore?.encoreCount || 0;
        
        // 앵콜 카운트가 10을 넘는 순간에만 알림을 보냅니다.
        if (encoreCountAfter >= 10 && encoreCountBefore < 10) {
            logger.info(`Product ${productId} reached ${encoreCountAfter} encore requests. Sending notifications.`);
            
            // 여기에 '앵콜 가능' 알림을 보내는 로직을 추가할 수 있습니다.
            // 예: productDataAfter.encoreRequesterIds.forEach(userId => createNotification(userId, ...));
        }
    }

    // `FieldValue` 같은 admin 기능을 사용하려면 'firebase-admin'을 import해야 합니다.
    // 예: const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();

    return;
});