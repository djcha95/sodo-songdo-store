// src/utils/productUtils.ts

import type { Product, SalesRound } from '@/types';
import { Timestamp } from 'firebase/firestore';

/**
 * Safely converts various date formats (Timestamp, Date, object, string) to a JavaScript Date object.
 * Returns null if the format is unsupported or the input is null/undefined.
 */
export const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date.toDate === 'function') return date.toDate();
  if (typeof date === 'object' && date.seconds !== undefined) {
    return new Timestamp(date.seconds, date.nanoseconds || 0).toDate();
  }
  if (typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  console.warn("Unsupported date format:", date);
  return null;
};

/**
 * Determines the most relevant sales round for a product to display to a customer.
 * The priority is:
 * 1. The round currently 'selling'.
 * 2. The next upcoming 'scheduled' round.
 * 3. The most recently ended/sold_out round.
 * 4. The most recently created non-draft round.
 */
export const getDisplayRound = (product: Product): SalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) return null;

  // 1. Find the round that is actively 'selling'
  const sellingRound = product.salesHistory.find(r => r.status === 'selling');
  if (sellingRound) return sellingRound;

  // 2. Find the nearest future 'scheduled' round
  const now = new Date();
  const futureScheduledRounds = product.salesHistory
    .filter(r => {
      const publishAt = safeToDate(r.publishAt);
      return r.status === 'scheduled' && publishAt && publishAt > now;
    })
    .sort((a, b) => safeToDate(a.publishAt)!.getTime() - safeToDate(b.publishAt)!.getTime());
  if (futureScheduledRounds.length > 0) return futureScheduledRounds[0];

  // 3. Find the most recently finished round (ended or sold_out)
  const pastRounds = product.salesHistory
    .filter(r => r.status === 'ended' || r.status === 'sold_out')
    .sort((a, b) => {
        const dateA = safeToDate(b.deadlineDate); // 마감일 기준 정렬이 더 정확
        const dateB = safeToDate(a.deadlineDate);
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime();
    });
  if (pastRounds.length > 0) return pastRounds[0];
  
  // 4. Fallback to any non-draft round, sorted by creation date
  const nonDraftRounds = product.salesHistory
    .filter(r => r.status !== 'draft')
    .sort((a,b) => {
        const dateA = safeToDate(b.createdAt);
        const dateB = safeToDate(a.createdAt);
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime()
    });

  return nonDraftRounds[0] || null;
};