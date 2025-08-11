// functions/src/grantSnackPackToAll.ts
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Product, UserDocument } from './types.js'; // UserDocument 타입 추가

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// [수정] 이벤트 상품 ID와 이벤트 ID를 상수로 명확하게 정의합니다.
const EVENT_PRODUCT_ID = 'GIFT_WELCOME_SNACK'; 
const UNIVERSAL_SNACK_EVENT_ID = 'welcome-snack-2025-all'; // 새로운 통합 이벤트 ID

export const grantSnackPackToAllUsers = onCall(
  { region: 'asia-northeast3', timeoutSeconds: 540, memory: '1GiB' },
  async (req) => {
    
    const productRef = db.collection('products').doc(EVENT_PRODUCT_ID);
    const productSnap = await productRef.get();

    if (!productSnap.exists) {
        console.error(`Event product '${EVENT_PRODUCT_ID}' not found.`);
        throw new HttpsError('not-found', `이벤트 상품(${EVENT_PRODUCT_ID})을 찾을 수 없습니다.`);
    }
    const productData = productSnap.data() as Product;
    const eventRound = productData.salesHistory?.[0];
    const eventVariantGroup = eventRound?.variantGroups?.[0];
    const eventItem = eventVariantGroup?.items?.[0];

    if (!eventRound || !eventVariantGroup || !eventItem) {
        console.error(`'salesHistory' or its children are missing in '${EVENT_PRODUCT_ID}' product.`);
        throw new HttpsError('internal', '이벤트 상품의 판매 정보(salesHistory)가 올바르지 않습니다.');
    }

    const usersRef = db.collection('users');
    const snap = await usersRef.get();

    const bulk = db.bulkWriter();
    let createdCount = 0;
    let skippedCount = 0;

    // [핵심] 알림톡 방지를 위해 픽업일을 과거 날짜(어제)로 강제 설정합니다.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    for (const doc of snap.docs) {
      const u = doc.data() as UserDocument;
      const userId = doc.id;

      // [제거] 가입일(CUTOFF_DATE) 기준 필터링 로직을 완전히 제거하여 모든 사용자를 대상으로 합니다.
      
      // [수정] 중복 지급 방지 체크: 새로운 통합 이벤트 ID로 검사합니다.
      const already = await db.collection('orders')
        .where('userId', '==', userId)
        .where('eventId', '==', UNIVERSAL_SNACK_EVENT_ID)
        .limit(1)
        .get();

      if (!already.empty) {
        skippedCount++;
        continue;
      }

      const orderRef = db.collection('orders').doc();
      const orderDoc = {
        id: orderRef.id,
        userId: userId,
        status: 'RESERVED',
        wasPrepaymentRequired: false,
        eventId: UNIVERSAL_SNACK_EVENT_ID, // [수정] 새로운 통합 이벤트 ID 사용
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        // [핵심] 상품 정보의 픽업일 대신, 위에서 계산한 '어제' 날짜를 사용하여 알림톡을 방지합니다.
        pickupDate: admin.firestore.Timestamp.fromDate(yesterday),
        // [수정] deadlineDate는 상품 정보를 따르되, deadlineText를 통일합니다.
        pickupDeadlineDate: eventRound.pickupDeadlineDate || null, 
        deadlineText: "이벤트 증정 (소진 시까지)", // 문구 명확화
        cancelLocked: true,
        items: [
          {
            productId: productSnap.id,
            productName: productData.groupName,
            roundId: eventRound.roundId,
            roundName: eventRound.roundName,
            variantGroupId: eventVariantGroup.id,
            variantGroupName: eventVariantGroup.groupName,
            itemId: eventItem.id,
            itemName: eventItem.name,
            unitPrice: eventItem.price,
            quantity: 1,
            imageUrl: productData.imageUrls?.[0] || '',
            deadlineDate: eventRound.deadlineDate,
            stockDeductionAmount: eventItem.stockDeductionAmount,
          },
        ],
        customerInfo: {
          name: u.displayName || '이벤트 고객',
          phone: u.phone || '',
          phoneLast4: u.phoneLast4 || (u.phone ? u.phone.slice(-4) : ''),
        },
      };

      bulk.set(orderRef, orderDoc);
      createdCount++;
    }

    await bulk.close();
    console.log(`[Snack Grant All] Process finished. Created: ${createdCount}, Skipped: ${skippedCount}`);
    return { createdCount, skippedCount };
  }
);