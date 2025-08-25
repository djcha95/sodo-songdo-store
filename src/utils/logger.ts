// src/utils/logger.ts
// src/utils/logger.ts

type Meta = Record<string, unknown> | undefined;

const isProd =
  typeof process !== "undefined" &&
  process.env &&
  process.env.NODE_ENV === "production";

/**
 * 정보성 로그(이벤트 트래킹)
 * 사용 예: reportInfo('usePersistentState.readFail', `key=${key}`, { error: String(error) })
 */
export function reportInfo(event: string, message?: string, meta?: Meta): void {
  // 콘솔
  if (!isProd) {
    // 개발환경에서는 더 보기 좋게
    // eslint-disable-next-line no-console
    console.info(`[INFO] ${event}${message ? ` - ${message}` : ""}`, meta ?? "");
  }

  // Google Analytics(gtag) 예시
  try {
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", event, {
        event_category: "info",
        event_label: message ?? "",
        ...meta,
      });
    }
  } catch {
    /* noop */
  }

  // Sentry/LogRocket 등 연동 시 여기 추가
  // try { Sentry.captureMessage(`${event}: ${message ?? ""}`, { level: 'info', extra: meta }); } catch {}
}

/**
 * 에러 로그
 * 사용 예: reportError('ProductListPageAdmin.fetchData', error)
 * 또는    reportError('Some.place', error, { id })
 */
export function reportError(event: string, error: unknown, meta?: Meta): void {
  const errObj =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");

  // 콘솔
  if (!isProd) {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${event}`, errObj, meta ?? "");
  }

  // Google Analytics(gtag) 예시
  try {
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", event, {
        event_category: "error",
        event_label: errObj.message,
        stack: errObj.stack,
        ...meta,
      });
    }
  } catch {
    /* noop */
  }

  // Sentry 등 에러 추적 도구 연동
  // try { Sentry.captureException(errObj, { extra: { event, ...(meta ?? {}) } }); } catch {}
}

// 필요하면 기본 콘솔 래퍼도 제공 (선택사항)
export const logger = {
  info: reportInfo,
  error: reportError,
};
