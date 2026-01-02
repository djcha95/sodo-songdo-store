// functions/src/triggers/reservations.ts
/**
 * 예약(reservations) 생성 트리거
 * - 최근 60초 내 예약이 2건 이상일 때만 발송
 * - 1회 발송 후 60초 쿨타임
 * - 상태 문서(system/alertState) + 이벤트 ID 기반 중복방지
 * - Android 공폰(FCM 토큰 1개)에만 Push (title: [ALARM], body: 최종 메시지)
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import type { FirestoreEvent, DocumentSnapshot } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { admin, dbAdmin as db } from "../firebase/admin.js";

type ReservationItemLike = {
  productName?: string;
  productTitle?: string;
  name?: string;
  title?: string;
  itemName?: string;
  variantGroupName?: string;
  optionName?: string;
  quantity?: number;
  qty?: number;
};

type ReservationLike = {
  createdAt?: Timestamp | Date | string | null;
  shortCode?: string;
  // reservations 스키마가 프로젝트/버전별로 다를 수 있어 여러 키를 허용
  items?: ReservationItemLike[] | null;
  cartItems?: ReservationItemLike[] | null;
  orderItems?: ReservationItemLike[] | null;
  products?: ReservationItemLike[] | null;
  // fallback 단일 필드
  productName?: string;
  quantity?: number;
};

type AlertStateDoc = {
  reservationAlert?: {
    lastSentAt?: Timestamp | null;
    cooldownUntil?: Timestamp | null;
    lastAlertEventId?: string | null;
  };
};

type DeviceTokenDoc = {
  token?: string | null;
  platform?: "android" | "ios" | "web" | string;
  updatedAt?: Timestamp;
};

const REGION = "asia-northeast3";
const WINDOW_SECONDS = 60;
const COOLDOWN_SECONDS = 60;
const MIN_RECENT_RESERVATIONS = 2;
const MESSAGE_MAX_LINES = 3; // 숫자 노출(예약건수) 없이도 충분히 '실시간 느낌'을 내는 범위

const ALERT_STATE_PATH = "system/alertState";
const DEVICE_TOKEN_PATH = "system/deviceTokens/kakaoBot";
const ALERT_LOG_COLLECTION = "reservationAlerts"; // system/alertState/{subcollection}

function asTimestamp(value: unknown, fallback: Timestamp): Timestamp {
  if (!value) return fallback;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d);
  }
  return fallback;
}

function hashTo4Digits(input: string): string {
  // 간단한 FNV-1a 32bit → 0000~9999 매핑 (문서 ID가 숫자가 아니어도 "3725" 같은 형태를 보장)
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = Math.abs(h) % 10000;
  return String(n).padStart(4, "0");
}

function pickDisplayCode(reservationId: string, reservation: ReservationLike): string {
  const raw = (reservation.shortCode || "").toString().trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return hashTo4Digits(reservationId);
}

function normalizeItems(reservation: ReservationLike): ReservationItemLike[] {
  const candidates = [reservation.items, reservation.cartItems, reservation.orderItems, reservation.products];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return [];
}

function normalizeQty(qtyRaw: unknown): number {
  if (typeof qtyRaw === "number" && Number.isFinite(qtyRaw) && qtyRaw > 0) return Math.floor(qtyRaw);
  return 1;
}

function buildItemTitle(item: ReservationItemLike): string {
  const base =
    (item.productName ||
      item.productTitle ||
      item.name ||
      item.title ||
      "").toString().trim();
  const variant = (item.variantGroupName || item.optionName || "").toString().trim();
  const leaf = (item.itemName || "").toString().trim();

  // 중복/노이즈를 줄이기 위해 기본명 우선 + (옵션/구성명) 보조
  const parts: string[] = [];
  if (base) parts.push(base);
  if (variant && variant !== base) parts.push(variant);
  if (leaf && leaf !== base && leaf !== variant) parts.push(leaf);
  return parts.join(" ").trim();
}

function pickItemLine(reservationId: string, reservation: ReservationLike): string | null {
  const code = pickDisplayCode(reservationId, reservation);

  const items = normalizeItems(reservation);
  const first = items[0];

  const titleFromItem = first ? buildItemTitle(first) : "";
  const title = (titleFromItem || reservation.productName || "").toString().trim();

  const qty = normalizeQty(first?.quantity ?? first?.qty ?? reservation.quantity ?? 1);

  if (!title) return null;

  // 여러 아이템이면 숫자(건수) 없이 "추가 구성 포함"으로만 암시 (예약 수/건수와 무관)
  const hasMore = items.length > 1;
  const suffix = hasMore ? " · 추가 구성 포함" : "";
  return `"${code}" ${title} x${qty}${suffix}`;
}

function buildMessage(lines: string[]): string {
  // 시간 단위/예약 건수 숫자 노출 금지. "방금" 같은 표현만 사용.
  const header = `[소도몰알리밍]\n💙 방금 들어온 예약 소식\n`;
  return `${header}\n${lines.join("\n")}`.trim();
}

async function sendFcmToSingleAndroid(token: string, message: string, data?: Record<string, string>) {
  return await admin.messaging().send({
    token,
    notification: {
      title: "[ALARM]",
      body: message,
    },
    android: {
      priority: "high",
      ttl: 2 * 60 * 1000, // 2분 (단말 자동화가 약간 늦게 처리돼도 유효)
      collapseKey: "reservation-alert", // 최신 알림 위주로 정리
    },
    data: {
      type: "RESERVATION_ALERT",
      ...data,
    },
  });
}

export const onReservationCreated = onDocumentCreated(
  {
    document: "reservations/{reservationId}",
    region: REGION,
  },
  async (event: FirestoreEvent<DocumentSnapshot | undefined, { reservationId: string }>) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.info("예약 생성 이벤트에 데이터가 없어 스킵합니다.");
      return;
    }

    const reservationId = event.params.reservationId;
    const reservation = (snapshot.data() || {}) as ReservationLike;

    // v2 event.time: ISO string (재시도에도 동일하게 유지됨)
    const now = Timestamp.now();
    const eventTimeTs = asTimestamp((event as any).time, now);
    const createdAt = asTimestamp(reservation.createdAt, eventTimeTs);

    // createdAt이 비어있으면 채워두기(향후 window 카운트 정확도/인덱싱 일관성)
    if (!reservation.createdAt) {
      try {
        await snapshot.ref.set({ createdAt }, { merge: true });
      } catch (e) {
        // createdAt 보정 실패는 치명적이지 않으므로 경고만 남김
        logger.warn("createdAt 보정 실패(무시):", { reservationId, error: (e as Error)?.message ?? String(e) });
      }
    }

    const stateRef = db.doc(ALERT_STATE_PATH);
    const alertRef = stateRef.collection(ALERT_LOG_COLLECTION).doc(event.id); // 이벤트 단위 멱등 처리

    const windowStart = Timestamp.fromMillis(now.toMillis() - WINDOW_SECONDS * 1000);
    const cooldownUntilNext = Timestamp.fromMillis(now.toMillis() + COOLDOWN_SECONDS * 1000);

    // 최근 예약을 일부만 읽어 메시지 라인 구성 (예약건수 숫자 노출 없이도 충분)
    const recentQuery = db
      .collection("reservations")
      .where("createdAt", ">=", windowStart)
      .orderBy("createdAt", "desc")
      .limit(Math.max(MIN_RECENT_RESERVATIONS, MESSAGE_MAX_LINES));

    try {
      const decision = await db.runTransaction(async (tx) => {
        const [stateSnap, existingAlertSnap, recentSnap] = await Promise.all([
          tx.get(stateRef),
          tx.get(alertRef),
          tx.get(recentQuery),
        ]);

        if (existingAlertSnap.exists) {
          return { action: "noop" as const, reason: "duplicate_event" as const };
        }

        const state = (stateSnap.data() || {}) as AlertStateDoc;
        const cooldownUntil = state.reservationAlert?.cooldownUntil ?? null;
        if (cooldownUntil && cooldownUntil.toMillis() > now.toMillis()) {
          tx.set(
            alertRef,
            {
              status: "skipped",
              reason: "cooldown",
              eventId: event.id,
              reservationId,
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return { action: "noop" as const, reason: "cooldown" as const };
        }

        // 조건 1) 최근 60초 내 예약 2건 이상
        if (recentSnap.size < MIN_RECENT_RESERVATIONS) {
          tx.set(
            alertRef,
            {
              status: "skipped",
              reason: "insufficient_recent_reservations",
              eventId: event.id,
              reservationId,
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return { action: "noop" as const, reason: "insufficient" as const };
        }

        // 메시지 라인 구성: 최근 예약들에서 2~3줄만 뽑기 (예약건수/시간 숫자 언급 금지)
        const lines: string[] = [];
        for (const doc of recentSnap.docs) {
          const line = pickItemLine(doc.id, (doc.data() || {}) as ReservationLike);
          if (!line) continue;
          if (lines.includes(line)) continue;
          lines.push(line);
          if (lines.length >= MESSAGE_MAX_LINES) break;
        }

        // 라인을 못 뽑으면 안전하게 침묵
        if (lines.length < 2) {
          tx.set(
            alertRef,
            {
              status: "skipped",
              reason: "insufficient_message_lines",
              eventId: event.id,
              reservationId,
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return { action: "noop" as const, reason: "no_lines" as const };
        }

        const message = buildMessage(lines);

        // 상태 갱신(쿨타임 적용) + pending 로그 기록을 **원자적으로 커밋**
        tx.set(
          stateRef,
          {
            reservationAlert: {
              lastSentAt: now,
              cooldownUntil: cooldownUntilNext,
              lastAlertEventId: event.id,
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        tx.set(
          alertRef,
          {
            status: "pending",
            eventId: event.id,
            reservationId,
            triggerCreatedAt: createdAt,
            message,
            lines,
            createdAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return { action: "send" as const, message, lines };
      });

      if (decision.action !== "send") {
        logger.info("예약 알림 발송 조건 미충족 → 침묵 유지", {
          reservationId,
          reason: decision.reason,
        });
        return;
      }

      // 토큰은 별도 문서에서 조회(운영 중 교체 가능)
      const tokenSnap = await db.doc(DEVICE_TOKEN_PATH).get();
      const tokenDoc = (tokenSnap.data() || {}) as DeviceTokenDoc;
      const token = (tokenDoc.token || "").toString().trim();
      if (!token) {
        logger.error("FCM 토큰이 없어 발송 불가", { reservationId, deviceTokenPath: DEVICE_TOKEN_PATH });
        await alertRef.set(
          {
            status: "failed",
            reason: "missing_device_token",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return;
      }

      const messageId = await sendFcmToSingleAndroid(token, decision.message, {
        reservationId,
        eventId: event.id,
      });

      await alertRef.set(
        {
          status: "sent",
          messageId,
          sentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info("예약 알림 FCM 발송 완료", { reservationId, messageId });
    } catch (error) {
      logger.error("예약 알림 트리거 처리 중 오류", {
        reservationId,
        error: (error as Error)?.message ?? String(error),
        stack: (error as Error)?.stack,
      });
      // 오류가 나도 조건 미충족/침묵 정책을 깨지 않도록 여기서 throw 하지 않음(재시도 폭주 방지)
    }
  }
);


