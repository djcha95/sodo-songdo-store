import dayjs from 'dayjs';

import type { Product, ProductItem, SalesRound } from '@/shared/types';
import { getRemainingPurchasableCount, safeToDate } from '@/utils/productUtils';

export type MarketingBadgeTone = 'red' | 'orange' | 'blue' | 'gray' | 'black';

export type MarketingBadgeKey =
  | 'HOT_DEAL'
  | 'BEST'
  | 'NEW'
  | 'LIMITED'
  | 'RECOMMENDED';

export type MarketingBadge = {
  key: MarketingBadgeKey;
  label: string;
  tone: MarketingBadgeTone;
};

export function getTotalReservedCount(round: Pick<SalesRound, 'variantGroups'> | null | undefined): number {
  const vgs = round?.variantGroups ?? [];
  return vgs.reduce((sum, vg: any) => {
    const r = typeof vg?.reservedCount === 'number' && Number.isFinite(vg.reservedCount) ? vg.reservedCount : 0;
    return sum + r;
  }, 0);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function getDiscountPercent(item: ProductItem | null | undefined): number | null {
  if (!item) return null;
  const originalPrice = (item as any)?.originalPrice;
  const price = item.price;
  if (typeof originalPrice !== 'number' || !Number.isFinite(originalPrice)) return null;
  if (originalPrice <= 0 || price <= 0) return null;
  if (originalPrice <= price) return null;
  const pct = Math.round((1 - price / originalPrice) * 100);
  return Number.isFinite(pct) && pct > 0 ? pct : null;
}

function hashToInt(input: string): number {
  // 간단한 문자열 해시(djb2 변형) - 일관성/가벼움이 목적
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function getPopularityScore(args: {
  reservedCount: number;
  productId: string;
  seed?: string; // YYYY-MM-DD
}): number {
  // ⚠️ "주문 수"가 아닌, UI용 인기/관심 "지수"입니다 (홍보 목적).
  // 예약수가 0이어도 기본 인기지수를 표시하여 구매욕구를 자극합니다.
  const { reservedCount, productId, seed = dayjs().format('YYYY-MM-DD') } = args;

  const r = Math.max(0, Number.isFinite(reservedCount) ? reservedCount : 0);

  // 주문이 없는 상품도 기본 인기지수 부여 (홍보 목적)
  if (r === 0) {
    // 상품 ID 기반으로 일관된 기본값 생성 (50~150 범위)
    const h = hashToInt(`${seed}::popularity::${productId}`);
    const baseScore = 50 + (h % 100); // 50~149
    return baseScore;
  }

  // 기본 스케일: 0~20 정도를 60~300대까지 자연스럽게 확장
  // (r+1)^1.6 은 작은 값에서 크게 뛰고, 값이 커질수록 완만해짐
  const base = Math.round(Math.pow(r + 1, 1.6) * 22);

  // 일일 변동(고정): ±0~7% 정도
  const h = hashToInt(`${seed}::popularity::${productId}`);
  const wobblePct = (h % 15) - 7; // -7..+7
  const wobble = Math.round(base * (wobblePct / 100));

  // 너무 낮아 보이지 않게 최소치, 과도하게 커지지 않게 상한
  return clamp(base + wobble + 40, 40, 9999);
}

function isNewByDate(d: Date | null, now: Date, days: number): boolean {
  if (!d) return false;
  const diffDays = dayjs(now).diff(dayjs(d), 'day');
  return diffDays >= 0 && diffDays <= days;
}

function pickRecommendedDaily(productId: string, seed: string, chanceDivisor = 8): boolean {
  // 하루 단위로 "랜덤처럼" 보이되, 리렌더/정렬 변경에 흔들리지 않게 고정
  const h = hashToInt(`${seed}::${productId}`);
  return h % chanceDivisor === 0;
}

export function getMarketingBadges(args: {
  product: Product;
  round: SalesRound | null | undefined;
  selectedItem?: ProductItem | null;
  bestsellerRank?: number;
  now?: Date;
  seed?: string; // YYYY-MM-DD
  maxBadges?: number;
}): MarketingBadge[] {
  const {
    product,
    round,
    selectedItem,
    bestsellerRank,
    now = new Date(),
    seed = dayjs().format('YYYY-MM-DD'),
    maxBadges = 2,
  } = args;

  const badges: MarketingBadge[] = [];

  const specialLabels = Array.isArray((product as any).specialLabels) ? (product as any).specialLabels as string[] : [];

  // 1) 초특가
  const discountPct = getDiscountPercent(selectedItem ?? (round?.variantGroups?.[0]?.items?.[0] ?? null));
  const isEventDeal = specialLabels.includes('이벤트 특가');
  const isHotDeal = isEventDeal || (typeof discountPct === 'number' && discountPct >= 20);
  if (isHotDeal) {
    badges.push({ key: 'HOT_DEAL', label: '초특가', tone: 'red' });
  }

  // 2) 인기상품 (리스트에서는 상대 랭킹, 상세에서는 예약수 threshold)
  const totalReserved = getTotalReservedCount(round);
  const isBestByRank = typeof bestsellerRank === 'number' && bestsellerRank >= 1 && bestsellerRank <= 3;
  const isBestByThreshold = totalReserved >= 20;
  if (isBestByRank || isBestByThreshold) {
    // ✅ 요청: 인기상품은 항상 가장 왼쪽(우선순위 최상) + 흰 글씨가 잘 보이도록 다크 톤
    badges.push({ key: 'BEST', label: '인기상품', tone: 'black' });
  }

  // 3) 신상품 (관리자 specialLabels 우선 + 날짜 기반)
  const productCreatedAt = safeToDate((product as any).createdAt);
  const roundCreatedAt = safeToDate((round as any)?.createdAt) ?? safeToDate((round as any)?.publishAt);
  const isNewLabel = specialLabels.includes('신상품');
  const isNew =
    isNewLabel ||
    isNewByDate(roundCreatedAt, now, 10) ||
    isNewByDate(productCreatedAt, now, 14);
  if (isNew) {
    badges.push({ key: 'NEW', label: '신상품', tone: 'blue' });
  }

  // 4) 수량 한정 (라벨이 있는 경우에만)
  if (specialLabels.includes('수량 한정')) {
    badges.push({ key: 'LIMITED', label: '수량 한정', tone: 'black' });
  }

  // 5) 추천(일일 랜덤) - 상위 뱃지들로 꽉 차면 생략
  const minPurchasable = (() => {
    const vgs = round?.variantGroups ?? [];
    if (vgs.length === 0) return null;
    let min: number | null = null;
    for (const vg of vgs as any[]) {
      const purchasable = getRemainingPurchasableCount(vg);
      if (!Number.isFinite(purchasable)) continue;
      min = min === null ? purchasable : Math.min(min, purchasable);
    }
    return min;
  })();

  // 마지막 찬스(재고 3 이하)는 이미 숫자 뱃지가 있어서 추천 확률에서 제외(덜 산만하게)
  const isLastChance = typeof minPurchasable === 'number' && minPurchasable > 0 && minPurchasable <= 3;
  if (!isLastChance && pickRecommendedDaily(product.id, seed) && badges.length < maxBadges) {
    badges.push({ key: 'RECOMMENDED', label: '추천', tone: 'gray' });
  }

  // 우선순위 정렬 + 최대 개수 제한
  const priority: Record<MarketingBadgeKey, number> = {
    BEST: 10,
    HOT_DEAL: 20,
    NEW: 30,
    LIMITED: 40,
    RECOMMENDED: 50,
  };

  const uniqueByKey = new Map<MarketingBadgeKey, MarketingBadge>();
  for (const b of badges) uniqueByKey.set(b.key, b);

  return [...uniqueByKey.values()]
    .sort((a, b) => priority[a.key] - priority[b.key])
    .slice(0, Math.max(1, maxBadges));
}


