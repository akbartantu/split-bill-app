import type { Bill } from '@/types/bill';

export function calculateReceiptSubtotalCents(bill: Bill, receiptId: string): number {
  return bill.items
    .filter(item => item.receiptId === receiptId)
    .reduce((sum, item) => sum + item.lineTotalMinor, 0);
}

export function calculateReceiptTotalCents(bill: Bill, receiptId: string): number {
  return calculateReceiptSubtotalCents(bill, receiptId);
}
