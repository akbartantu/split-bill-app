import type { Receipt } from '@/types/bill';
import type { ReceiptStatus } from '@/selectors/receiptStatus';

export function getDefaultExpandedReceiptIds(
  receipts: Receipt[],
  statuses: ReceiptStatus[]
): Set<string> {
  if (receipts.length === 0) return new Set();
  if (receipts.length === 1) return new Set([receipts[0].id]);

  const mostRecent = [...receipts]
    .filter(r => r.createdAt)
    .sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime())[0]
    || receipts[receipts.length - 1];

  const attention = statuses
    .filter(s => s.missingPayer || s.needsReview)
    .map(s => s.receiptId);

  return new Set([mostRecent.id, ...attention]);
}
