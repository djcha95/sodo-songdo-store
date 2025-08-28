// functions/src/http/banner.ts

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { Timestamp } from "firebase-admin/firestore";

// dayjs 관련 import는 그대로 유지
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

import type { Product, SalesRound, VariantGroup, Order, OrderItem } from "../types.js";

dayjs.extend(isBetween);

// --- 헬퍼 함수들 (기존과 동일) ---
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
    } catch(e) {
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
    memory: "1GiB", // ✅ [개선] 주문 데이터 조회를 위해 메모리 상향
  },
  async (req, res) => {
    logger.info("✅ getBannerProductsHttp 함수 실행 시작");

    try {
      // ✅ [개선] 1. 상품과 주문 정보를 병렬로 가져옵니다.
      const [productsSnapshot, ordersSnapshot] = await Promise.all([
        db.collection("products").where("isVisible", "==", true).get(),
        db.collection("orders").where("status", "in", ["RESERVED", "PREPAID", "PICKED_UP"]).get()
      ]);

      // ✅ [개선] 2. 예약 수량을 계산하여 Map에 저장합니다. (getProductsWithStock 로직과 동일)
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

      const now = dayjs();
      const bannerProducts: any[] = [];

      productsSnapshot.forEach((doc) => {
        const product = doc.data() as Product;
        if (!product || !product.groupName) return;

        const displayRound = getDisplayRound(product);
        if (!displayRound) return;

        if (
          displayRound.manualStatus === "sold_out" ||
          displayRound.manualStatus === "ended"
        ) return;
        
        // isManuallyOnsite 상태는 배너에 노출하지 않음
        if (displayRound.isManuallyOnsite) return;

        const { primaryEnd, secondaryEnd } = getDeadlines(displayRound);
        let phase: "primary" | "secondary" | "past" = "past";

        if (primaryEnd && now.isBefore(primaryEnd)) {
          phase = "primary";
        } else if (secondaryEnd && primaryEnd && now.isBetween(primaryEnd, secondaryEnd, null, "(]")) {
          phase = "secondary";
        }

        if (phase === "primary" || phase === "secondary") {
          // ✅ [개선] 3. 실제 예약량을 반영하여 '품절' 여부를 판단합니다.
          const isSoldOut = (displayRound.variantGroups || []).every(
            (vg: VariantGroup) => {
              const stock = vg.totalPhysicalStock;
              // 무제한 재고가 아니면 품절 여부 계산
              if (stock !== -1 && stock !== null && stock !== undefined) {
                const key = `${doc.id}-${displayRound.roundId}-${vg.id}`;
                const reservedCount = claimedMap.get(key) || 0;
                const remainingStock = stock - reservedCount;
                return remainingStock <= 0;
              }
              // 무제한 재고는 절대 품절 아님
              return false;
            }
          );
          
          if(isSoldOut) return;

          bannerProducts.push({
            id: doc.id,
            status: phase,
            name: product.groupName,
            price: displayRound.variantGroups?.[0]?.items?.[0]?.price || 0,
            imageUrl: product.imageUrls?.[0] || "",
          });
        }
      });

      const sortedProducts = bannerProducts.sort((a, b) => b.price - a.price);
      logger.info(`✅ 성공: ${sortedProducts.length}개의 상품을 찾았습니다.`);
      res.status(200).json({ products: sortedProducts });

    } catch (error: any) {
      logger.error("getBannerProductsHttp 처리 중 심각한 오류 발생:", error);
      res.status(500).json({ error: "배너 상품 목록을 불러오는 중 오류가 발생했습니다." });
    }
  }
);