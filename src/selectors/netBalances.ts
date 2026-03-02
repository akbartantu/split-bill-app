import type { Bill } from '@/types/bill';
import { calculateReceiptTotalCents } from '@/selectors/receiptTotals';
import { getFairShareCentsByReceipt } from '@/selectors/fairShareSelectors';

export interface NetBalanceSummary {
  paidByPerson: Record<string, number>;
  fairByPerson: Record<string, number>;
  netByPerson: Record<string, number>;
  missingPayerReceiptIds: string[];
}

export function getNetBalanceSummary(bill: Bill): NetBalanceSummary {
  const receipts = bill.receipts || [];
  const fairByReceipt = getFairShareCentsByReceipt(bill);
  const paidByPerson: Record<string, number> = {};
  const fairByPerson: Record<string, number> = {};
  const netByPerson: Record<string, number> = {};
  const missingPayerReceiptIds: string[] = [];

  bill.participants.forEach(p => {
    paidByPerson[p.id] = 0;
    fairByPerson[p.id] = 0;
    netByPerson[p.id] = 0;
  });

  receipts.forEach(receipt => {
    if (!receipt.payerPersonId) {
      missingPayerReceiptIds.push(receipt.id);
      return;
    }
    const receiptTotalMinor = receipt.paidAmountMinor ?? calculateReceiptTotalCents(bill, receipt.id);
    paidByPerson[receipt.payerPersonId] = (paidByPerson[receipt.payerPersonId] || 0) + receiptTotalMinor;

    const fairMap = fairByReceipt[receipt.id] || {};
    bill.participants.forEach(p => {
      fairByPerson[p.id] = (fairByPerson[p.id] || 0) + (fairMap[p.id] || 0);
    });
  });

  bill.participants.forEach(p => {
    netByPerson[p.id] = (paidByPerson[p.id] || 0) - (fairByPerson[p.id] || 0);
  });

  return {
    paidByPerson,
    fairByPerson,
    netByPerson,
    missingPayerReceiptIds,
  };
}
