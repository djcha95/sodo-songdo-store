// functions/src/http/maintenance.ts (오류 수정됨)

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, admin } from "../firebase/admin.js";
import type { Product } from "@/shared/types"; // Make sure this path is correct
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore"; // Import QueryDocumentSnapshot

// ✅ [보안 강화] 관리자 권한 검증 함수 추가
const checkAdmin = async (request: any): Promise<boolean> => {
    if (!request.headers.authorization || !request.headers.authorization.startsWith('Bearer ')) {
        return false;
    }
    const idToken = request.headers.authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userRole = decodedToken.role;
        return userRole === 'admin' || userRole === 'master';
    } catch (error) {
        logger.error("Auth token verification failed:", error);
        return false;
    }
};

const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "1GiB" as const,
};

export const fixSalesHistoryHttp = onRequest(runtimeOpts, async (request, response) => {
    // ✅ [보안 강화] 관리자 권한 검증 추가
    const isAdmin = await checkAdmin(request);
    if (!isAdmin) {
        logger.error("Permission denied. Admin role required.");
        response.status(403).send("Permission denied. Admin role required.");
        return;
    }
    
    // ✅ [감사 로깅] 관리자 작업 감사 로그 기록
    const idToken = request.headers.authorization?.split('Bearer ')[1];
    let adminId = "unknown";
    let adminEmail: string | undefined;
    if (idToken) {
        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            adminId = decodedToken.uid;
            adminEmail = decodedToken.email;
        } catch (error) {
            logger.error("Failed to decode token for audit log:", error);
        }
    }
    
    const { logAdminAction, extractRequestInfo } = await import("../utils/auditLogger.js");
    const requestInfo = extractRequestInfo(request);
    
    await logAdminAction({
        adminId,
        adminEmail,
        action: "fixSalesHistoryHttp",
        resourceType: "product",
        ipAddress: requestInfo.ipAddress,
        userAgent: requestInfo.userAgent,
        success: true, // 시작 시점이므로 성공으로 기록
    });
    
    logger.warn("🚨 Starting potentially destructive data fix for salesHistory. Ensure backups exist! 🚨");

    response.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff', // Prevent MIME type sniffing
    });
    response.write("🚀 Firestore salesHistory Fix Script Started...\n\n");

    const productsRef = db.collection('products');
    let checkedCount = 0;
    let fixedCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 400;

    try {
        // Use stream() for efficient iteration over large collections
        const stream = productsRef.stream() as AsyncIterable<QueryDocumentSnapshot<DocumentData>>; // Type assertion

        let batch = db.batch();
        let batchCounter = 0;

        response.write("🔍 Starting product scan...\n");

        for await (const doc of stream) { // doc is now correctly typed as QueryDocumentSnapshot
            checkedCount++;
            const productData = doc.data() as Product; // Cast data to Product type
            const salesHistory = productData.salesHistory;

            if (salesHistory && !Array.isArray(salesHistory)) {
                response.write(`\n🚨 Found corrupted salesHistory (type: ${typeof salesHistory}) in product ID: ${doc.id}\n`);
                logger.warn(`🚨 Found corrupted salesHistory (type: ${typeof salesHistory}) in product ID: ${doc.id}`);

                let recoveredStock: number | null = null;
                let recoveredGroupName = productData.groupName || '복구된 옵션';
                try {
                    // Attempt to extract stock based on observed corrupted structure
                    if (typeof salesHistory === 'object' && salesHistory !== null && (salesHistory as any)['0']?.variantGroups?.['0']) {
                        const vgData = (salesHistory as any)['0'].variantGroups['0'];
                        if (typeof vgData.totalPhysicalStock === 'number') {
                            recoveredStock = vgData.totalPhysicalStock;
                            response.write(`  ✅ Recovered totalPhysicalStock: ${recoveredStock}\n`);
                        } else {
                             response.write(`  ⚠️ Could not recover stock value (type: ${typeof vgData.totalPhysicalStock}).\n`);
                        }
                    } else {
                         response.write(`  ⚠️ Unexpected corrupted structure. Could not extract specific data.\n`);
                    }
                } catch (e: any) {
                    response.write(`  ❌ Error extracting data: ${e.message}\n`);
                    logger.error(`Error extracting data for ${doc.id}:`, e);
                }

                // Create a minimal valid array structure
                const fixedSalesHistory = [
                  {
                    roundId: `recovered-${doc.id.substring(0, 5)}-${Date.now()}`,
                    roundName: '복구된 1차 판매',
                    createdAt: productData.createdAt || admin.firestore.Timestamp.now(),
                    status: 'draft' as const,
                    manualStatus: null,
                    variantGroups: [
                      {
                        id: `recovered-vg-${Date.now()}`,
                        groupName: recoveredGroupName,
                        totalPhysicalStock: recoveredStock,
                        stockUnitType: '개',
                        items: [
                          {
                            id: `recovered-item-${Date.now()}`,
                            name: '기본 옵션', price: 0, stock: -1, limitQuantity: null,
                            expirationDate: null, stockDeductionAmount: 1
                          }
                        ],
                      }
                    ],
                    publishAt: null, deadlineDate: null, pickupDate: null,
                    pickupDeadlineDate: null, waitlist: [], waitlistCount: 0,
                    // Add other mandatory fields from SalesRound with default values if necessary
                  }
                ];

                batch.update(doc.ref, { salesHistory: fixedSalesHistory });
                batchCounter++;
                fixedCount++;
                response.write(`  🔧 Added fix for ${doc.id} to batch.\n`);

                if (batchCounter >= BATCH_SIZE) {
                    response.write(`\n⏳ Committing batch of ${batchCounter} fixes...\n`);
                    await batch.commit();
                    response.write(`  ✅ Batch committed.\n`);
                    batch = db.batch();
                    batchCounter = 0;
                    await new Promise(resolve => setTimeout(resolve, 500)); // Add a small delay
                }
            }

            if (checkedCount % 100 === 0) {
                response.write(`  ... scanned ${checkedCount} documents ...\n`);
                await new Promise(resolve => setTimeout(resolve, 50)); // Prevent flooding logs/response
            }
        }

        if (batchCounter > 0) {
            response.write(`\n⏳ Committing final batch of ${batchCounter} fixes...\n`);
            await batch.commit();
            response.write(`  ✅ Final batch committed.\n`);
        }

        if (fixedCount === 0) {
            response.write('\n👍 No corrupted salesHistory found that requires fixing.\n');
        }

    } catch (error: any) {
        logger.error('❌ An error occurred during the script execution:', error);
        errorCount++;
        // Avoid writing headers again if already sent
        if (!response.headersSent) {
             response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        response.write(`\n❌❌❌ CRITICAL ERROR: ${error.message}\n`);
    } finally {
        const summary = `\n--- Script Summary ---\n` +
                        `Total documents checked: ${checkedCount}\n` +
                        `Documents fixed: ${fixedCount}\n` +
                        `Errors occurred: ${errorCount}\n` +
                        `🏁 Script finished.\n`;
        logger.info(summary);
        // Ensure response ends only once
        if (!response.writableEnded) {
            response.end(summary);
        }
    }
});