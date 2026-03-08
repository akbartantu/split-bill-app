/**
 * Client-side export: bill summary and expenses as CSV.
 */

import type { Bill, PersonSummary } from '@/types/bill';
import { formatMoneyMinor } from '@/lib/currency';
import { calculateBillSplit, calculateGrandTotal } from '@/lib/calculations';
import { getSettlementFromNet } from '@/selectors/settlement';
import { getNetBalanceSummary } from '@/selectors/netBalances';
import type { ExpenseSummary } from '@/selectors/expenses';

function escapeCsvCell(value: string): string {
  const s = String(value ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Download a string as a file with the given filename.
 */
export function downloadBlob(content: string, filename: string, mimeType = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export current bill: participants, items total, grand total, who owes whom.
 */
export function exportBillToCsv(bill: Bill): string {
  const summaries = calculateBillSplit(bill);
  const grandTotal = calculateGrandTotal(bill);
  const currencyCode = bill.currencyCode || bill.currency || 'USD';
  const balanceSummary = getNetBalanceSummary(bill);
  const transfers = getSettlementFromNet(balanceSummary.netByPerson, bill.participants.map(p => p.id));

  const rows: string[][] = [
    [bill.name || 'Bill', ''], ['Currency', currencyCode], ['Grand Total', formatMoneyMinor(grandTotal, currencyCode)], [],
    ['Participant', 'Items Total', 'Amount Paid', 'Net Owed'],
  ];

  for (const s of summaries) {
    rows.push([
      s.participantName,
      formatMoneyMinor(s.itemsTotal + s.adjustmentsShare, currencyCode),
      formatMoneyMinor(s.amountPaid, currencyCode),
      formatMoneyMinor(s.netOwed, currencyCode),
    ].map(escapeCsvCell));
  }

  rows.push([], ['Settle up']);
  for (const t of transfers) {
    const fromName = bill.participants.find(p => p.id === t.fromId)?.name ?? t.fromId;
    const toName = bill.participants.find(p => p.id === t.toId)?.name ?? t.toId;
    rows.push([`${fromName} pays ${toName}`, formatMoneyMinor(t.amountMinor, currencyCode)].map(escapeCsvCell));
  }

  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Export expense summary (by participant and by month) as CSV.
 */
export function exportExpensesToCsv(summary: ExpenseSummary, currencyCode: string): string {
  const rows: string[][] = [
    ['Expense Summary', ''], ['Total Spent', formatMoneyMinor(summary.totalSpentMinor, currencyCode)], ['Receipts', String(summary.receiptCount)], [],
    ['By Participant', 'Total Paid', 'Receipt Count', 'Bills'],
  ];

  for (const p of summary.byParticipant) {
    rows.push([
      p.participantName,
      formatMoneyMinor(p.totalPaidMinor, currencyCode),
      String(p.receiptCount),
      p.billNames.join('; '),
    ].map(escapeCsvCell));
  }

  rows.push([], ['By Month', 'Total', 'Receipt Count', 'Bills']);
  for (const m of summary.byMonth) {
    rows.push([
      m.label,
      formatMoneyMinor(m.totalMinor, currencyCode),
      String(m.receiptCount),
      m.billNames.join('; '),
    ].map(escapeCsvCell));
  }

  return rows.map(row => row.join(',')).join('\n');
}
