import type { Bill } from '@/types/bill';
import { calculateReceiptExtrasTotal, calculateReceiptSubtotal } from '@/lib/calculations';

export type ReceiptStatusType = 'missing_payer' | 'needs_review' | 'ready' | 'empty';

export interface ReceiptStatus {
  receiptId: string;
  receiptName: string;
  itemCount: number;
  totalMinor: number;
  payerName: string | null;
  missingPayer: boolean;
  needsReview: boolean;
  hasItems: boolean;
  status: ReceiptStatusType;
}

export interface ReceiptIssue {
  receiptId: string;
  type: 'missing_payer' | 'needs_review' | 'empty';
  label: string;
}

export function getReceiptStatuses(bill: Bill): ReceiptStatus[] {
  const receipts = bill.receipts || [];
  return receipts.map(receipt => {
    const items = bill.items.filter(item => item.receiptId === receipt.id);
    const itemCount = items.length;
    const hasItems = itemCount > 0;
    const needsReview = items.some(item => item.needsReview);
    const missingPayer = !receipt.payerPersonId;
    let status: ReceiptStatusType = 'ready';
    if (!hasItems) status = 'empty';
    else if (missingPayer) status = 'missing_payer';
    else if (needsReview) status = 'needs_review';

    const payerName = receipt.payerPersonId
      ? bill.participants.find(p => p.id === receipt.payerPersonId)?.name || 'Unknown'
      : null;

    const subtotalMinor = calculateReceiptSubtotal(bill, receipt.id);
    const extrasMinor = calculateReceiptExtrasTotal(bill, receipt.id);
    const totalMinor = subtotalMinor + extrasMinor;

    return {
      receiptId: receipt.id,
      receiptName: receipt.receiptName || receipt.merchantName || 'Receipt',
      itemCount,
      totalMinor,
      payerName,
      missingPayer,
      needsReview,
      hasItems,
      status,
    };
  });
}

export function getReceiptIssues(bill: Bill): ReceiptIssue[] {
  const statuses = getReceiptStatuses(bill);
  const issues: ReceiptIssue[] = [];
  statuses.forEach(status => {
    if (!status.hasItems) {
      issues.push({
        receiptId: status.receiptId,
        type: 'empty',
        label: 'No items yet',
      });
    }
    if (status.missingPayer) {
      issues.push({
        receiptId: status.receiptId,
        type: 'missing_payer',
        label: 'Missing payer',
      });
    }
    if (status.needsReview) {
      issues.push({
        receiptId: status.receiptId,
        type: 'needs_review',
        label: 'Items need review',
      });
    }
  });
  return issues;
}
