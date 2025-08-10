// src/utils/number.ts
export const formatKRW = (v: number | '' | null | undefined): string =>
  (v === '' || v == null ? '' : Number(v).toLocaleString('ko-KR'));

export const parseKRW = (s: string | number | null | undefined): number | '' => {
  if (s == null) return '';
  const n = typeof s === 'number' ? s : parseInt(String(s).replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? '' : n;
};
