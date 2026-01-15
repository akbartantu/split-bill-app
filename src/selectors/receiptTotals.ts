import type { Bill, ReceiptExtras, ReceiptExtraType } from '@/types/bill';

export function calculateReceiptSubtotalCents(bill: Bill, receiptId: string): number {
  return bill.items
    .filter(item => item.receiptId === receiptId)
    .reduce((sum, item) => sum + item.lineTotalMinor, 0);
}

function getReceiptExtras(bill: Bill, receiptId: string): ReceiptExtras {
  const defaults: ReceiptExtras = {
    tax: { mode: 'percentage', value: 0, isInclusive: false },
    service: { mode: 'percentage', value: 0, isInclusive: false },
    tip: { mode: 'percentage', value: 0, isInclusive: false },
  };
  return bill.receiptExtrasById?.[receiptId] || defaults;
}

export function calculateReceiptExtrasCents(bill: Bill, receiptId: string): number {
  const subtotalCents = calculateReceiptSubtotalCents(bill, receiptId);
  const extras = getReceiptExtras(bill, receiptId);
  const types: ReceiptExtraType[] = ['tax', 'service', 'tip'];
  let extrasCents = 0;

  types.forEach(type => {
    const extra = extras[type];
    if (extra.isInclusive) return;
    if (extra.mode === 'percentage') {
      extrasCents += Math.round(subtotalCents * (extra.value / 100));
    } else {
      extrasCents += Math.round(extra.value);
    }
  });

  return extrasCents;
}

export function calculateReceiptTotalCents(bill: Bill, receiptId: string): number {
  return calculateReceiptSubtotalCents(bill, receiptId) + calculateReceiptExtrasCents(bill, receiptId);
}
