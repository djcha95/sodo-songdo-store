// functions/src/setup.ts

import { onRequest, Request } from 'firebase-functions/v2/https';
import { Response } from 'express';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

export const setupEventProduct = onRequest(
    { region: 'asia-northeast3' },
    async (req: Request, res: Response) => {
        try {
            const productId = 'GIFT_WELCOME_SNACK';
            const productRef = db.collection('products').doc(productId);

            console.log(`Setting up product data for: ${productId}`);

            const productData = {
                groupName: "랜덤간식",
                description: "소도몰에 오신 것을 환영합니다! 드리는 작은 선물입니다.",
                imageUrls: [
                    // ✅ [수정] 중요! 리사이즈되지 않은 '원본 PNG' URL을 사용해야 합니다.
                    "https://firebasestorage.googleapis.com/v0/b/sso-do.firebasestorage.app/o/events%2FKakaoTalk_20250808_105323034.png?alt=media&token=f532b7c8-7d09-457e-a7ea-596ce3c2df51"
                ],
                isArchived: true,
                storageType: "ROOM",
                createdAt: Timestamp.now(),
                salesHistory: [
                    {
                        roundId: "welcome-round-01",
                        roundName: "사이트 오픈 기념 이벤트",
                        status: "ended",
                        publishAt: Timestamp.now(),
                        deadlineDate: Timestamp.now(),
                        pickupDate: Timestamp.now(),
                        variantGroups: [
                            {
                                id: "welcome-vg-01",
                                groupName: "기본",
                                items: [
                                    {
                                        id: "welcome-item-01",
                                        name: "기본",
                                        price: 0,
                                        stock: -1,
                                        stockDeductionAmount: 0
                                    }
                                ],
                                stockUnitType: "개",
                                "totalPhysicalStock": -1,
                            }
                        ]
                    }
                ]
            };
            
            await productRef.set(productData, { merge: true });

            console.log(`Successfully set up product data for: ${productId}`);
            res.status(200).send(`✅ 성공: '${productId}' 상품 데이터가 올바른 이미지 URL로 Firestore에 업데이트되었습니다.`);

        } catch (error) {
            console.error("Error setting up product data:", error);
            res.status(500).send("❌ 오류가 발생했습니다. Functions 로그를 확인해주세요.");
        }
    }
);