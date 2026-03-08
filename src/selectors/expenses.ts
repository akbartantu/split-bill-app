/**
 * Expense / spending aggregation across one or more bills.
 * Used for "My Spending" and expense reports.
 */

import type { Bill, Receipt, Payment, Participant } from '@/types/bill';

export interface SpendingByParticipant {
  participantId: string;
  participantName: string;
  participantColor: string;
  totalPaidMinor: number;
  receiptCount: number;
  billNames: string[];
}

export interface SpendingByMonth {
  yearMonth: string; // "2025-03"
  label: string;      // "March 2025"
  totalMinor: number;
  receiptCount: number;
  billNames: string[];
}

export interface ExpenseSummary {
  totalSpentMinor: number;
  receiptCount: number;
  byParticipant: SpendingByParticipant[];
  byMonth: SpendingByMonth[];
}

function getReceiptDate(receipt: Receipt): Date {
  if (receipt.date) {
    const d = new Date(receipt.date);
    if (!isNaN(d.getTime())) return d;
  }
  if (receipt.createdAt) return new Date(receipt.createdAt);
  return new Date();
}

function getReceiptTotal(receipt: Receipt, bill: Bill): number {
  if (receipt.paidAmountMinor != null && receipt.paidAmountMinor > 0) {
    return receipt.paidAmountMinor;
  }
  const paymentsForReceipt = bill.payments.filter(p => p.receiptId === receipt.id);
  if (paymentsForReceipt.length > 0) {
    return paymentsForReceipt.reduce((sum, p) => sum + p.amountMinor, 0);
  }
  const itemsForReceipt = bill.items.filter(i => i.receiptId === receipt.id);
  return itemsForReceipt.reduce((sum, i) => sum + i.lineTotalMinor, 0);
}

/**
 * Aggregate spending from multiple bills (e.g. currentBill + recentBills).
 */
export function getExpenseSummary(bills: Bill[]): ExpenseSummary {
  const byParticipantMap = new Map<string, SpendingByParticipant>();
  const byMonthMap = new Map<string, { totalMinor: number; receiptCount: number; billNames: Set<string> }>();
  let totalSpentMinor = 0;
  let receiptCount = 0;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  for (const bill of bills) {
    const receipts = bill.receipts || [];
    const participantsById = new Map(bill.participants.map(p => [p.id, p]));

    for (const receipt of receipts) {
      const total = getReceiptTotal(receipt, bill);
      if (total <= 0) continue;

      receiptCount += 1;
      totalSpentMinor += total;

      const payerId = receipt.payerPersonId ?? bill.payments.find(p => p.receiptId === receipt.id)?.payerId;
      if (payerId) {
        const p = participantsById.get(payerId);
        const name = p?.name ?? 'Unknown';
        const color = p?.color ?? '#888';
        const existing = byParticipantMap.get(payerId);
        if (existing) {
          existing.totalPaidMinor += total;
          existing.receiptCount += 1;
          if (!existing.billNames.includes(bill.name || bill.id)) existing.billNames.push(bill.name || bill.id);
        } else {
          byParticipantMap.set(payerId, {
            participantId: payerId,
            participantName: name,
            participantColor: color,
            totalPaidMinor: total,
            receiptCount: 1,
            billNames: [bill.name || bill.id].filter(Boolean),
          });
        }
      }

      const d = getReceiptDate(receipt);
      const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      const existingMonth = byMonthMap.get(yearMonth);
      const billLabel = bill.name || bill.id || 'Bill';
      if (existingMonth) {
        existingMonth.totalMinor += total;
        existingMonth.receiptCount += 1;
        existingMonth.billNames.add(billLabel);
      } else {
        byMonthMap.set(yearMonth, {
          totalMinor: total,
          receiptCount: 1,
          billNames: new Set([billLabel]),
        });
      }
    }
  }

  const byParticipant = Array.from(byParticipantMap.values()).sort((a, b) => b.totalPaidMinor - a.totalPaidMinor);
  const byMonth = Array.from(byMonthMap.entries())
    .map(([yearMonth, data]) => ({
      yearMonth,
      label: (() => {
        const [y, m] = yearMonth.split('-').map(Number);
        return `${monthNames[m - 1]} ${y}`;
      })(),
      totalMinor: data.totalMinor,
      receiptCount: data.receiptCount,
      billNames: Array.from(data.billNames),
    }))
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  return {
    totalSpentMinor,
    receiptCount,
    byParticipant,
    byMonth,
  };
}
