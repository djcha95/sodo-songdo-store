// scripts/migrateReservedQuantities.js

// 이 스크립트를 실행하려면 firebase-admin이 필요합니다.
// npm install firebase-admin

const admin = require("firebase-admin");

// ⚠️ 중요: 자신의 Firebase 서비스 계정 키 파일 경로를 입력하세요.
// Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성
const serviceAccount = require("../path/to/your/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateData() {
  console.log("기존 주문 데이터 마이그레이션을 시작합니다...");

  try {
    // 1. 모든 '확정' 상태의 주문을 가져옵니다.
    const ordersSnapshot = await db
      .collection("orders")
      .where("status", "==", "confirmed") // '확정'된 주문만 계산
      .get();

    if (ordersSnapshot.empty) {
      console.log("마이그레이션할 주문 데이터가 없습니다.");
      return;
    }

    // 2. 상품별, 회차별, 옵션별 예약 수량을 집계합니다.
    const aggregatedQuantities = new Map();
    ordersSnapshot.forEach((doc) => {
      const order = doc.data();
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item) => {
          if (item.productId && item.roundId && item.variantGroupId) {
            const key = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
            aggregatedQuantities.set(
              key,
              (aggregatedQuantities.get(key) || 0) + item.quantity
            );
          }
        });
      }
    });

    console.log("예약 수량 집계 완료. Product 문서 업데이트를 시작합니다...");

    // 3. 집계된 데이터를 Product 문서에 업데이트합니다.
    const productUpdates = new Map();
    for (const [key, quantity] of aggregatedQuantities.entries()) {
      const productId = key.split("-")[0];
      if (!productUpdates.has(productId)) {
        productUpdates.set(productId, {});
      }
      productUpdates.get(productId)[`reservedQuantities.${key}`] = quantity;
    }

    const batch = db.batch();
    for (const [productId, updateData] of productUpdates.entries()) {
      const productRef = db.collection("products").doc(productId);
      batch.update(productRef, updateData);
    }

    await batch.commit();

    console.log(
      `${productUpdates.size}개의 Product 문서에 대한 마이그레이션을 성공적으로 완료했습니다.`
    );
  } catch (error) {
    console.error("마이그레이션 중 오류가 발생했습니다:", error);
  }
}

migrateData();