// functions/src/scripts/convertToTimestampHTTP.ts

import * as admin from 'firebase-admin';
import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { Timestamp as AdminFirestoreTimestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

// Firebase Admin SDK 초기화 (index.ts 등에서 이미 되어있다면 생략 가능)
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// --- 헬퍼 함수: 객체인지, Timestamp 객체가 아닌지 확인 ---
function isPlainTimestampObject(value: any): value is { seconds: number; nanoseconds: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    // Firestore 타임스탬프 객체와 일반 객체를 구분하기 위해 seconds/nanoseconds 타입 확인 강화
    typeof value.seconds === 'number' && Number.isInteger(value.seconds) &&
    typeof value.nanoseconds === 'number' && Number.isInteger(value.nanoseconds) &&
    // 이미 Firestore Timestamp 객체인 경우는 제외 (toDate 메소드 유무로 확인)
    typeof value.toDate !== 'function' &&
    // Date 객체도 제외
    !(value instanceof Date)
  );
}

// --- 메인 함수 (HTTP 트리거) ---
export const convertObjectDatesToTimestampHTTP = onRequest(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 540, // 9분
    memory: '1GiB',
  },
  async (req, res) => {
    // 1. 관리자 권한 확인 (Firebase Auth ID 토큰 필요)
    // 실제 요청 시 헤더에 'Authorization: Bearer <ID_TOKEN>' 포함 필요
    // 로컬 테스트 시에는 이 부분을 주석 처리하거나 우회할 수 있음
    /*
    if (!req.auth || !['admin', 'master'].includes(req.auth.token.role)) {
      logger.error('Permission denied. Admin role required.');
      res.status(403).send('Permission denied. Admin role required.');
      return;
    }
    const adminUid = req.auth.uid;
    */
    // 임시: 로컬 테스트용 (실제 배포 시 위 주석 해제 및 이 라인 제거)
    const adminUid = 'TEST_ADMIN';
    logger.warn('Running with TEST_ADMIN UID. Remove this for production deployment!');

    // 2. 쿼리 파라미터 받기 (collection, dryRun)
    const collectionName = req.query.collection as string;
    const dryRun = req.query.dryRun === 'true'; // dryRun=true 이외의 모든 값은 false로 간주

    if (!collectionName || (collectionName !== 'products' && collectionName !== 'orders')) {
      logger.error("Invalid collection name. Must be 'products' or 'orders'.");
      res.status(400).send("Query parameter 'collection' must be 'products' or 'orders'.");
      return;
    }

    logger.info(`🚀 [Data Migration HTTP] Triggered by ${adminUid}. Starting date conversion for '${collectionName}'. Dry run: ${dryRun}`);

    try {
      const collectionRef = db.collection(collectionName);
      const snapshot = await collectionRef.get();

      if (snapshot.empty) {
        logger.info(`✅ No documents found in '${collectionName}'. Nothing to process.`);
        res.status(200).send(`✅ Processed 0 documents in '${collectionName}'. No documents found.`);
        return;
      }

      const bulkWriter = db.bulkWriter();
      let processedCount = 0;
      let updatedCount = 0;
      const errors: { id: string; error: string }[] = [];

      // --- 문서 순회 및 필드 변환 ---
      for (const doc of snapshot.docs) {
        processedCount++;
        const data = doc.data();
        const updates: { [key: string]: any } = {}; // 이 문서에서 업데이트할 필드들

        try {
          // --- 대상 필드 정의 및 변환 ---
          if (collectionName === 'products') {
            const productDateFields = ['createdAt', 'updatedAt'];
            productDateFields.forEach(field => {
              if (isPlainTimestampObject(data[field])) {
                updates[field] = new AdminFirestoreTimestamp(data[field].seconds, data[field].nanoseconds);
              }
            });

            // salesHistory 배열 처리
            if (Array.isArray(data.salesHistory)) {
              let historyChanged = false;
              const newSalesHistory = data.salesHistory.map((round: any) => {
                let roundChanged = false;
                const roundUpdates: { [key: string]: any } = {};
                const roundDateFields = ['createdAt', 'publishAt', 'deadlineDate', 'pickupDate', 'pickupDeadlineDate', 'arrivalDate'];
                roundDateFields.forEach(field => {
                  if (isPlainTimestampObject(round[field])) {
                    roundUpdates[field] = new AdminFirestoreTimestamp(round[field].seconds, round[field].nanoseconds);
                    roundChanged = true;
                  }
                });

                // variantGroups 내 items의 expirationDate 처리
                let vgsChanged = false;
                let newVariantGroups = round.variantGroups;
                if (Array.isArray(round.variantGroups)) {
                  newVariantGroups = round.variantGroups.map((vg: any) => {
                    let itemsChanged = false;
                    let newItems = vg.items;
                     if (Array.isArray(vg.items)) {
                       newItems = vg.items.map((item: any) => {
                         if (isPlainTimestampObject(item.expirationDate)) {
                           itemsChanged = true;
                           return { ...item, expirationDate: new AdminFirestoreTimestamp(item.expirationDate.seconds, item.expirationDate.nanoseconds) };
                         }
                         return item;
                       });
                     }
                    if (itemsChanged) {
                        vgsChanged = true;
                        return { ...vg, items: newItems };
                    }
                    return vg;
                  });
                }
                 if(vgsChanged) {
                    roundUpdates.variantGroups = newVariantGroups;
                    roundChanged = true;
                 }

                if (roundChanged) historyChanged = true;
                return roundChanged ? { ...round, ...roundUpdates } : round;
              });

              if (historyChanged) {
                   updates.salesHistory = newSalesHistory;
              }
            }
          }
          else if (collectionName === 'orders') {
            const orderDateFields = ['createdAt', 'pickupDate', 'pickupDeadlineDate', 'pickedUpAt', 'prepaidAt', 'canceledAt'];
            orderDateFields.forEach(field => {
              if (isPlainTimestampObject(data[field])) {
                updates[field] = new AdminFirestoreTimestamp(data[field].seconds, data[field].nanoseconds);
              }
            });
             // orders.items 내 날짜 필드 처리 (예시: arrivalDate, deadlineDate 등)
            if (Array.isArray(data.items)) {
              let itemsChanged = false;
              const newItems = data.items.map((item: any) => {
                 let itemChanged = false;
                 const itemUpdates: { [key: string]: any } = {};
                 const itemDateFields = ['arrivalDate', 'deadlineDate', 'pickupDate', 'pickupDeadlineDate', 'expirationDate']; // items 내 날짜 필드
                 itemDateFields.forEach(field => {
                    if (isPlainTimestampObject(item[field])) {
                       itemUpdates[field] = new AdminFirestoreTimestamp(item[field].seconds, item[field].nanoseconds);
                       itemChanged = true;
                    }
                 });
                 if (itemChanged) itemsChanged = true;
                 return itemChanged ? { ...item, ...itemUpdates } : item;
              });
              if (itemsChanged) {
                 updates.items = newItems;
              }
            }
          }

          // --- 업데이트 실행 (Dry Run 아닐 때만) ---
          if (Object.keys(updates).length > 0) {
            if (!dryRun) {
              bulkWriter.update(doc.ref, updates).catch(err => {
                logger.error(`Error adding update for document ${doc.id} to BulkWriter:`, err);
                // BulkWriter 오류는 개별적으로 잡기 어려울 수 있으므로, close() 후 확인
                errors.push({ id: doc.id, error: `BulkWriter add failed: ${err.message}` });
              });
            }
            logger.info(`[${dryRun ? 'DryRun' : 'Update Queued'}] Document ${doc.id}: Found ${Object.keys(updates).length} fields to convert.`);
            updatedCount++;
          }

        } catch (error: any) {
          logger.error(`Error processing document ${doc.id}:`, error);
          errors.push({ id: doc.id, error: error.message });
        }
      } // End of document loop

      // --- 최종 처리 ---
      if (!dryRun && updatedCount > 0) {
         logger.info(`Flushing BulkWriter with ${updatedCount} updates...`);
         await bulkWriter.close(); // 실제 쓰기 작업 실행 및 완료 대기
         logger.info('BulkWriter flushed.');
      } else if (dryRun) {
         logger.info('Dry run finished. No data was modified.');
      } else {
         logger.info('No documents required updates.');
      }

      const message = `✅ [${dryRun ? 'DryRun' : 'Completed'}] Conversion finished for '${collectionName}'. Processed ${processedCount} documents. Found ${updatedCount} documents with fields to convert. ${errors.length} errors during processing/writing.`;
      logger.info(message);

      if (errors.length > 0) {
        logger.error('Errors occurred:', errors);
        // 오류가 있었음을 응답에 명시
        res.status(500).send(`${message}\n\n🚨 Errors occurred. Check Functions logs for details.`);
      } else {
        res.status(200).send(message);
      }

    } catch (error: any) {
      logger.error(`FATAL Error during conversion for '${collectionName}':`, error);
      if (error instanceof HttpsError) {
         res.status(error.httpErrorCode.status).send(error.message);
      } else {
         res.status(500).send(`An unexpected error occurred: ${error.message}`);
      }
    }
  }
);