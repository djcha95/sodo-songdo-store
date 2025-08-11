// functions/src/triggers/users.ts

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { MISSION_REWARDS } from '../pointService.js';
import type { UserDocument, Product } from '../types.js';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

// ✅ [이름 변경] 함수 이름을 onUserCreate에서 handleNewUserSetup으로 변경하여 중복을 피합니다.
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
    const newUser = snapshot.data() as UserDocument;

    console.log(`[New User Trigger] User document created for ${userId}. Starting welcome rewards.`);
    
    // ✅ [복구] 빠져있던 포인트 지급 로직을 다시 추가합니다.
    const pointMissionId = 'signup-bonus';
    const pointReward = MISSION_REWARDS[pointMissionId];
    if (pointReward) {
        console.log(`[Points] Awarding ${pointReward.points} points to new user ${userId}.`);

        const pointExpiration = new Date();
        pointExpiration.setFullYear(pointExpiration.getFullYear() + 1);

        const pointLog = {
            amount: pointReward.points,
            reason: pointReward.reason,
            createdAt: Timestamp.now(), // Timestamp 사용
            expiresAt: Timestamp.fromDate(pointExpiration),
        };

        await snapshot.ref.update({
            points: FieldValue.increment(pointReward.points),
            pointHistory: FieldValue.arrayUnion(pointLog),
        });

        console.log(`[Points] Successfully awarded points to ${userId}.`);
    }


    // --- 가입 환영 간식 주문 생성 ---
    try {
        const productRef = db.collection('products').doc('GIFT_WELCOME_SNACK');
        const productSnap = await productRef.get();

        if (!productSnap.exists) {
            console.error(`Welcome snack product 'GIFT_WELCOME_SNACK' not found.`);
            return;
        }
        const productData = productSnap.data() as Product;

        console.log("Fetched Image URL:", productData.imageUrls?.[0]);

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

        const snackEventId = 'welcome-snack-pack';
        const newOrderRef = db.collection('orders').doc();

        const orderDoc = {
            id: newOrderRef.id,
            userId: userId,
            status: 'RESERVED',
            wasPrepaymentRequired: false,
            eventId: snackEventId,
            createdAt: FieldValue.serverTimestamp(),
            pickupDate: eventRound.pickupDate,
            pickupDeadlineDate: eventRound.pickupDeadlineDate || null,
            deadlineText: '가입일로부터 1년',
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
});