// src/utils/logger.ts
// 중앙 에러 로깅 단일 진입점. 지금은 console + 확장 포인트(sentry 등)만.
type Extra = Record<string, unknown>;

export const reportError = (where: string, err: unknown, extra: Extra = {}) => {
  const e = err instanceof Error ? err : new Error(String(err));
  if (import.meta.env?.DEV) {
    // 개발환경에선 콘솔 상세 출력
    console.error(`[ERROR] ${where}`, e, extra);
  } else {
    // 운영환경 공통 처리(추후 Sentry/GA4 등 연결)
    console.error(`[ERROR] ${where}`, e.message, extra);
  }
};

export const reportInfo = (where: string, msg: string, extra: Extra = {}) => {
  if (import.meta.env?.DEV) console.info(`[INFO] ${where} — ${msg}`, extra);
};
