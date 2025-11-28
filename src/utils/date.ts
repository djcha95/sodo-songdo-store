// src/utils/date.ts

export const toYmd = (d: Date | null | undefined): string =>
  d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';

export const toDateTimeLocal = (d: Date | null | undefined): string =>
  d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

export const fromYmd = (s: string | null | undefined): Date | null =>
  s ? new Date(`${s}T00:00:00`) : null;

// ✅ [추가] Firestore Timestamp 등을 안전하게 Date 객체로 변환하는 함수
export const safeToDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate(); // Firestore Timestamp
  if (typeof val === 'number') return new Date(val);
  return null;
};