// functions/src/grantSnackPack.ts
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Product } from './types.js';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

const EVENT_PRODUCT_ID = 'GIFT_WELCOME_SNACK'; 
const EVENT_ID = '2025-snack-pack';

export const grantSnackPackToEligibleUsers = onCall(
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
    const CUTOFF_DATE = new Date('2025-09-30T23:59:59+09:00');

    // ✅ [수정] 알림톡 방지를 위해 픽업일을 어제 날짜로 강제 설정합니다.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    for (const doc of snap.docs) {
      const u = doc.data() || {};
      const userId = doc.id;

      let createdAt: Date | null = null;
      const rawCreatedAt = u.createdAt || u.signupDate;
      try {
        if (!rawCreatedAt) createdAt = null;
        else if (rawCreatedAt.toDate) createdAt = rawCreatedAt.toDate();
        else if (typeof rawCreatedAt === 'string') createdAt = new Date(rawCreatedAt);
        else if (rawCreatedAt._seconds) createdAt = new admin.firestore.Timestamp(rawCreatedAt._seconds, rawCreatedAt._nanoseconds || 0).toDate();
        else if (rawCreatedAt.seconds) createdAt = new admin.firestore.Timestamp(rawCreatedAt.seconds, rawCreatedAt.nanoseconds || 0).toDate();
      } catch {
        createdAt = null;
      }
      
      if (!createdAt || createdAt.getTime() > CUTOFF_DATE.getTime()) {
        skippedCount++;
        continue;
      }
      
      const already = await db.collection('orders')
        .where('userId', '==', userId)
        .where('eventId', '==', EVENT_ID)
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
        eventId: EVENT_ID,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        // ✅ [수정] 상품 정보의 픽업일 대신, 위에서 계산한 '어제' 날짜를 사용합니다.
        pickupDate: admin.firestore.Timestamp.fromDate(yesterday),
        pickupDeadlineDate: eventRound.pickupDeadlineDate || null,
        deadlineText: '소진시까지',
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
          phoneLast4: u.phoneLast4 || '',
        },
      };

      bulk.set(orderRef, orderDoc);
      createdCount++;
    }

    await bulk.close();
    return { createdCount, skippedCount };
  }
);