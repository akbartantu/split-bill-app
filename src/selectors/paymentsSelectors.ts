import type { Bill } from '@/types/bill';

export function getPaymentsByReceipt(bill: Bill): Record<string, Bill['payments']> {
  const map: Record<string, Bill['payments']> = {};
  bill.payments.forEach(payment => {
    if (!map[payment.receiptId]) {
      map[payment.receiptId] = [];
    }
    map[payment.receiptId].push(payment);
  });
  return map;
}

export function getPaidCentsByReceiptAndPerson(bill: Bill): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  bill.payments.forEach(payment => {
    if (!result[payment.receiptId]) {
      result[payment.receiptId] = {};
    }
    const receiptMap = result[payment.receiptId];
    receiptMap[payment.payerId] = (receiptMap[payment.payerId] || 0) + payment.amountMinor;
  });
  return result;
}

export function getTotalPaidCentsByReceipt(bill: Bill): Record<string, number> {
  const result: Record<string, number> = {};
  bill.payments.forEach(payment => {
    result[payment.receiptId] = (result[payment.receiptId] || 0) + payment.amountMinor;
  });
  return result;
}
