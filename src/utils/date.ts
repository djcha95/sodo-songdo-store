// src/utils/date.ts
export const toYmd = (d: Date | null | undefined): string =>
  d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';

export const toDateTimeLocal = (d: Date | null | undefined): string =>
  d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

export const fromYmd = (s: string | null | undefined): Date | null =>
  s ? new Date(`${s}T00:00:00`) : null;
