// functions/src/http/banner.ts

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp } from "firebase-admin/firestore";

import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

import type { Product, SalesRound, VariantGroup, Order, OrderItem } from "../types.js";

dayjs.extend(isBetween);

// --- 헬퍼 함수들은 이전과 동일 ---
const safeToDate = (dateInput: any): Date | null => {
    try {
        if (!dateInput) return null;
        if (dateInput instanceof Timestamp) return dateInput.toDate();
        if (dateInput instanceof Date) return dateInput;
        const parsed = dayjs(dateInput);
        return parsed.isValid() ? parsed.toDate() : null;
    } catch (e) {
        return null;
    }
};

const getDisplayRound = (product: any): SalesRound | null => {
    try {
        if (!product || !Array.isArray(product.salesHistory) || product.salesHistory.length === 0) return null;
        const now = dayjs();
        const sortedRounds = [...product.salesHistory]
            .filter((r: any) => r && r.status !== 'draft' && r.publishAt)
            .sort((a: any, b: any) => {
                const dateA = safeToDate(a.publishAt)?.getTime() || 0;
                const dateB = safeToDate(b.publishAt)?.getTime() || 0;
                return dateB - dateA;
            });
        if (sortedRounds.length === 0) return null;
        return sortedRounds.find((r: any) => dayjs(safeToDate(r.publishAt)).isBefore(now)) || sortedRounds[0];
    } catch (e) {
        logger.error("getDisplayRound에서 오류 발생:", e, { productId: product?.id });
        return null;
    }
};

const getDeadlines = (round: SalesRound) => {
    const primaryEnd = safeToDate(round.deadlineDate);
    const secondaryEnd = safeToDate(round.pickupDate);
    return { primaryEnd, secondaryEnd };
};

export const getBannerProductsHttp = onRequest(
  {
    region: "asia-northeast3",
    cors: allowedOrigins,
    memory: "1GiB",
  },
  async (req, res) => {
    logger.info("✅ getBannerProductsHttp 함수 실행 시작");

    try {
      const [productsSnapshot, ordersSnapshot] = await Promise.all([
        db.collection("products").where("isVisible", "==", true).get(),
        db.collection("orders").where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"]).get()
      ]);

      const claimedMap = new Map<string, number>();
      ordersSnapshot.docs.forEach((od) => {
        const order = od.data() as Order;
        const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
        items.forEach((it) => {
          if (!it.productId || !it.roundId || !it.variantGroupId) return;
          const key = `${it.productId}-${it.roundId}-${it.variantGroupId}`;
          const quantityToDeduct = (it.quantity || 0) * (it.stockDeductionAmount || 1);
          if (!quantityToDeduct) return;
          claimedMap.set(key, (claimedMap.get(key) || 0) + quantityToDeduct);
        });
      });
      logger.debug("계산된 전체 예약 현황:", Object.fromEntries(claimedMap));


      const now = dayjs();
      const bannerProducts: any[] = [];

      for (const doc of productsSnapshot.docs) {
        const product = doc.data() as Product;
        logger.debug(`[${product.groupName}] 상품 확인 시작...`);

        if (!product || !product.groupName) {
            logger.debug(`[${product.groupName}] SKIPPING: 상품 데이터나 이름이 유효하지 않음`);
            continue;
        };

        const displayRound = getDisplayRound(product);
        if (!displayRound) {
            logger.debug(`[${product.groupName}] SKIPPING: 표시할 판매 회차 없음`);
            continue;
        };

        if (displayRound.manualStatus === "sold_out" || displayRound.manualStatus === "ended") {
            logger.debug(`[${product.groupName}] SKIPPING: 수동으로 판매 종료됨 (상태: ${displayRound.manualStatus})`);
            continue;
        };
        
        if (displayRound.isManuallyOnsite) {
            logger.debug(`[${product.groupName}] SKIPPING: 현장 판매 상품으로 설정됨`);
            continue;
        };

        const { primaryEnd, secondaryEnd } = getDeadlines(displayRound);
        let phase: "primary" | "secondary" | "past" = "past";

        if (primaryEnd && now.isBefore(primaryEnd)) {
          phase = "primary";
        } else if (secondaryEnd && primaryEnd && now.isBetween(primaryEnd, secondaryEnd, null, "(]")) {
          phase = "secondary";
        }
        logger.debug(`[${product.groupName}] 현재 판매 단계: ${phase}`);

        if (phase === "primary" || phase === "secondary") {
          const variantChecks = (displayRound.variantGroups || []).map(
            (vg: VariantGroup) => {
              const stock = vg.totalPhysicalStock;
              if (stock !== -1 && stock !== null && stock !== undefined) {
                const key = `${doc.id}-${displayRound.roundId}-${vg.id}`;
                const reservedCount = claimedMap.get(key) || 0;
                const remainingStock = stock - reservedCount;
                logger.debug(` -> [${vg.groupName}] 옵션: 총재고=${stock}, 예약=${reservedCount}, 남은재고=${remainingStock}`);
                return remainingStock <= 0;
              }
              logger.debug(` -> [${vg.groupName}] 옵션: 무제한 재고`);
              return false;
            }
          );
          
          const isSoldOut = variantChecks.every(Boolean);
          logger.debug(`[${product.groupName}] 모든 옵션 품절 여부: ${isSoldOut}`);
          
          if(isSoldOut) {
            logger.debug(`[${product.groupName}] SKIPPING: 모든 옵션 품절로 판단됨`);
            continue;
          }

          logger.info(`[${product.groupName}] ✅ SUCCESS: 배너 상품 목록에 추가됨!`);

          // ✅ [수정] Timestamp를 웹 표준 ISO 문자열로 변환하여 전달
          const pickupDate = safeToDate(displayRound.pickupDate);
          const deadlineDate = safeToDate(displayRound.deadlineDate);

          bannerProducts.push({
            id: doc.id,
            status: phase,
            name: product.groupName,
            price: displayRound.variantGroups?.[0]?.items?.[0]?.price || 0,
            imageUrl: product.imageUrls?.[0] || "",
            pickupDate: pickupDate ? pickupDate.toISOString() : null,
            deadlineDate: deadlineDate ? deadlineDate.toISOString() : null,
          });
        } else {
            logger.debug(`[${product.groupName}] SKIPPING: 판매 기간이 아님 (phase: ${phase})`);
        }
      }

      const sortedProducts = bannerProducts.sort((a, b) => b.price - a.price);
      logger.info(`✅ 최종 결과: ${sortedProducts.length}개의 상품을 찾았습니다.`);
      res.status(200).json({ products: sortedProducts });

    } catch (error: any) {
      logger.error("getBannerProductsHttp 처리 중 심각한 오류 발생:", error);
      res.status(500).json({ error: "배너 상품 목록을 불러오는 중 오류가 발생했습니다." });
    }
  }
);