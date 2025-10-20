// functions/src/triggers/users.ts

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { MISSION_REWARDS } from '../utils/pointService.js';
// ✅ [수정] 사용하지 않는 'Product' 타입을 import 목록에서 제거합니다.

if (admin.apps.length === 0) {
    admin.initializeApp();
}

// ✅ [수정] 주석 처리된 코드에서만 사용되었으므로 'db' 변수 선언을 제거합니다.
// const db = admin.firestore();

// handleNewUserSetup 함수는 그대로 유지합니다.
export const handleNewUserSetup = onDocumentCreated({
    document: "users/{userId}",
    region: "asia-northeast3",
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.error("No data associated with the event");
        return;
    }
    const userId = event.params.userId;
    // ✅ [수정] 주석 처리된 코드에서만 사용되었으므로 'newUser' 변수 선언을 제거합니다.
    // const newUser = snapshot.data() as UserDocument;

    console.log(`[New User Trigger] User document created for ${userId}. Starting welcome rewards.`);
    
    // 포인트 지급 로직 (변경 없음)
    const pointMissionId = 'signup-bonus';
    const pointReward = MISSION_REWARDS[pointMissionId];
    if (pointReward) {
        console.log(`[Points] Awarding ${pointReward.points} points to new user ${userId}.`);

        const pointExpiration = new Date();
        pointExpiration.setFullYear(pointExpiration.getFullYear() + 1);

        const pointLog = {
            amount: pointReward.points,
            reason: pointReward.reason,
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromDate(pointExpiration),
        };

        await snapshot.ref.update({
        points: FieldValue.increment(pointReward.points),
        pointHistory: FieldValue.arrayUnion(pointLog),
        loyaltyTier: '공구초보', // ✅ [추가]
        pickupCount: 0,         // ✅ [추가]
        noShowCount: 0,         // ✅ [추가]
    });

        console.log(`[Points] Successfully awarded points to ${userId}.`);
    }

    /*
    // =================================================================
    // ✅ [수정] 이벤트가 종료되어 가입 환영 간식 지급 로직을 비활성화합니다.
    // =================================================================
    // --- 가입 환영 간식 주문 생성 (비활성화된 로직) ---
    try {
        const productRef = db.collection('products').doc('GIFT_WELCOME_SNACK');
        const productSnap = await productRef.get();

        if (!productSnap.exists) {
            console.error(`Welcome snack product 'GIFT_WELCOME_SNACK' not found.`);
            return;
        }
        const productData = productSnap.data() as Product;
        const eventRound = productData.salesHistory?.[0];
        if (!eventRound) {
            console.error(`'salesHistory' is missing in 'GIFT_WELCOME_SNACK' product.`);
            return;
        }
        const eventVariantGroup = eventRound.variantGroups?.[0];
        const eventItem = eventVariantGroup?.items?.[0];
        if (!eventVariantGroup || !eventItem) {
            console.error(`'variantGroups' or 'items' are missing in 'GIFT_WELCOME_SNACK' salesHistory.`);
            return;
        }

        const snackEventId = 'welcome-snack-2025-all';
        const newOrderRef = db.collection('orders').doc();
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const orderDoc = {
            id: newOrderRef.id,
            userId: userId,
            status: 'RESERVED',
            wasPrepaymentRequired: false,
            eventId: snackEventId,
            createdAt: FieldValue.serverTimestamp(),
            pickupDate: Timestamp.fromDate(yesterday), 
            pickupDeadlineDate: eventRound.pickupDeadlineDate || null,
            deadlineText: "이벤트 증정 (소진 시까지)",
            cancelLocked: true,
            items: [{
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
                stockDeductionAmount: eventItem.stockDeductionAmount
            }],
            customerInfo: {
                name: newUser.displayName || '신규 고객',
                phone: newUser.phone || '',
                phoneLast4: newUser.phoneLast4 || (newUser.phone ? newUser.phone.slice(-4) : ''),
            },
        };

        await newOrderRef.set(orderDoc);
        console.log(`[Snack] Successfully created welcome snack order ${newOrderRef.id} for user ${userId}.`);

    } catch (error) {
        console.error(`[Snack] Failed to create welcome snack for user ${userId}.`, error);
    }
    */
});