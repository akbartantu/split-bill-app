import type { Bill, PersonSummary, Transfer, Participant, ReceiptExtraType, ReceiptExtras } from '@/types/bill';
import { formatMoneyMinor } from '@/lib/currency';

/**
 * Round to nearest cent (or specified precision)
 */
export function roundToNearest(value: number, precision: number = 0.01): number {
  const multiplier = 1 / precision;
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Format currency for display
 */
export function formatCurrency(amountMinor: number, currencyCode: string, locale?: string): string {
  const sign = amountMinor < 0 ? '-' : '';
  const formatted = formatMoneyMinor(Math.abs(amountMinor), currencyCode, locale);
  return `${sign}${formatted}`;
}

/**
 * Calculate the subtotal of all items
 */
export function calculateSubtotal(bill: Bill): number {
  return bill.items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
}

function getReceiptExtras(bill: Bill, receiptId: string): ReceiptExtras {
  const defaults: ReceiptExtras = {
    tax: { mode: 'percentage', value: 0, isInclusive: false },
    service: { mode: 'percentage', value: 0, isInclusive: false },
    tip: { mode: 'percentage', value: 0, isInclusive: false },
  };
  return bill.receiptExtrasById?.[receiptId] || defaults;
}

export function calculateReceiptSubtotal(bill: Bill, receiptId: string): number {
  return bill.items
    .filter(item => item.receiptId === receiptId)
    .reduce((sum, item) => sum + item.lineTotalMinor, 0);
}

export function calculateReceiptExtrasTotal(bill: Bill, receiptId: string): number {
  const subtotal = calculateReceiptSubtotal(bill, receiptId);
  const extras = getReceiptExtras(bill, receiptId);
  const extraTypes: ReceiptExtraType[] = ['tax', 'service', 'tip'];

  let extrasMinor = 0;

  extraTypes.forEach(type => {
    const extra = extras[type];
    if (extra.isInclusive) return;
    if (extra.mode === 'percentage') {
      extrasMinor += Math.round(subtotal * (extra.value / 100));
    } else {
      extrasMinor += Math.round(extra.value);
    }
  });

  return extrasMinor;
}

export function calculateReceiptGrandTotal(bill: Bill, receiptId: string): number {
  const subtotal = calculateReceiptSubtotal(bill, receiptId);
  const extras = calculateReceiptExtrasTotal(bill, receiptId);
  return subtotal + extras;
}

/**
 * Calculate adjustments total (tax, service, tip minus discounts)
 */
export function calculateAdjustmentsTotal(bill: Bill): number {
  const receipts = bill.receipts || [];
  if (receipts.length > 0 && bill.receiptExtrasById) {
    return receipts.reduce((sum, receipt) => {
      return sum + calculateReceiptExtrasTotal(bill, receipt.id);
    }, 0);
  }

  const subtotal = calculateSubtotal(bill);
  
  return bill.adjustments.reduce((total, adj) => {
    if (adj.isInclusive) return total; // Already in prices
    
    const amount = adj.mode === 'percentage' 
      ? subtotal * (adj.value / 100)
      : adj.value;
    
    return total + (adj.type === 'discount' ? -amount : amount);
  }, 0);
}

/**
 * Calculate the grand total
 */
export function calculateGrandTotal(bill: Bill): number {
  const receipts = bill.receipts || [];
  if (receipts.length > 0 && bill.receiptExtrasById) {
    return receipts.reduce((sum, receipt) => sum + calculateReceiptGrandTotal(bill, receipt.id), 0);
  }
  return calculateSubtotal(bill) + calculateAdjustmentsTotal(bill);
}

/**
 * Main calculation: split bill among participants
 */
export function calculateBillSplit(bill: Bill): PersonSummary[] {
  const summaries = new Map<string, PersonSummary>();
  const participantReceiptTotals = new Map<string, Map<string, number>>();
  
  // Initialize summaries for each participant
  bill.participants.forEach(p => {
    summaries.set(p.id, {
      participantId: p.id,
      participantName: p.name,
      participantColor: p.color,
      itemsTotal: 0,
      adjustmentsShare: 0,
      grandTotal: 0,
      amountPaid: 0,
      netOwed: 0,
      itemBreakdown: [],
    });
  });

  if (bill.participants.length === 0) {
    return [];
  }

  // Build receipt map for grouping
  const receiptMap = new Map<string, { receiptName: string; date?: string }>();
  if (bill.receipts && bill.receipts.length > 0) {
    bill.receipts.forEach(r => {
      receiptMap.set(r.id, { receiptName: r.receiptName || r.merchantName || 'Receipt', date: r.date });
    });
  }
  
  // Track receipt numbers for fallback labels
  const receiptCounter = new Map<string, number>();
  let receiptNumber = 1;
  
  // Step 1: Calculate item totals per person and build receipt groups
  const splitCents = (total: number, weights: number[]): number[] => {
    const weightSum = weights.reduce((sum, w) => sum + w, 0);
    if (weightSum <= 0) return weights.map(() => 0);
    const base = weights.map(w => Math.floor((total * w) / weightSum));
    let remainder = total - base.reduce((sum, v) => sum + v, 0);
    let i = 0;
    while (remainder > 0) {
      base[i % base.length] += 1;
      remainder -= 1;
      i += 1;
    }
    return base;
  };

  bill.items.forEach(item => {
    const itemTotal = item.lineTotalMinor;
    const receiptId = item.receiptId || 'receipt_1'; // Default to first receipt if missing
    let receiptInfo = receiptMap.get(receiptId);
    if (!receiptInfo) {
      // Generate fallback label - never use "Unknown receipt"
      if (!receiptCounter.has(receiptId)) {
        receiptCounter.set(receiptId, receiptNumber++);
      }
      const receiptNum = receiptCounter.get(receiptId) || 1;
      receiptInfo = { receiptName: `Receipt ${receiptNum}` };
    }
    
    // Determine who pays for this item
    let assignments: { participantId: string; shareCount: number }[];
    
    if (item.assignees.length === 0) {
      // No assignees = split among everyone equally
      assignments = bill.participants.map(p => ({ 
        participantId: p.id, 
        shareCount: 1 
      }));
    } else {
      assignments = item.assignees;
    }
    
    const splits = splitCents(itemTotal, assignments.map(a => a.shareCount));
    assignments.forEach((assignment, idx) => {
      const summary = summaries.get(assignment.participantId);
      if (summary) {
        const share = splits[idx] || 0;
        summary.itemsTotal += share;
        summary.itemBreakdown.push({
          itemName: item.name,
          amount: share,
        });
        
        // Build receipt groups
        if (!summary.receiptGroups) {
          summary.receiptGroups = [];
        }
        
        let receiptGroup = summary.receiptGroups.find(g => g.receiptId === receiptId);
        if (!receiptGroup) {
          receiptGroup = {
            receiptId,
            receiptLabel: receiptInfo.receiptName, // Already has proper label from receiptInfo
            receiptDate: receiptInfo.date,
            items: [],
            groupTotalAmount: 0,
          };
          summary.receiptGroups.push(receiptGroup);
        }
        
        receiptGroup.items.push({
          itemId: item.id,
          itemName: item.name,
          allocatedAmount: share,
          quantity: item.quantity,
          unitPrice: item.unitPriceMinor,
          lineTotal: itemTotal,
        });
        receiptGroup.groupTotalAmount += share;

        if (!participantReceiptTotals.has(assignment.participantId)) {
          participantReceiptTotals.set(assignment.participantId, new Map());
        }
        const receiptMap = participantReceiptTotals.get(assignment.participantId)!;
        receiptMap.set(receiptId, (receiptMap.get(receiptId) || 0) + share);
      }
    });
  });

  // Step 2: Calculate subtotal
  const subtotal = Array.from(summaries.values())
    .reduce((sum, s) => sum + s.itemsTotal, 0);

  const receipts = bill.receipts || [];
  const useReceiptExtras = receipts.length > 0 && bill.receiptExtrasById;

  // Step 3: Apply adjustments proportionally
  if (useReceiptExtras) {
    receipts.forEach(receipt => {
      const receiptSubtotal = calculateReceiptSubtotal(bill, receipt.id);
      const receiptExtras = calculateReceiptExtrasTotal(bill, receipt.id);
      if (receiptExtras === 0) return;

      if (receiptSubtotal <= 0) {
        const equalSplits = splitCents(receiptExtras, bill.participants.map(() => 1));
        bill.participants.forEach((p, idx) => {
          const summary = summaries.get(p.id);
          if (summary) summary.adjustmentsShare += equalSplits[idx];
        });
        return;
      }

      const weights = bill.participants.map(p => {
        const receiptTotals = participantReceiptTotals.get(p.id);
        return receiptTotals?.get(receipt.id) || 0;
      });
      const splits = splitCents(receiptExtras, weights);
      bill.participants.forEach((p, idx) => {
        const summary = summaries.get(p.id);
        if (summary) summary.adjustmentsShare += splits[idx];
      });
    });
  } else if (subtotal > 0) {
    bill.adjustments.forEach(adj => {
      if (adj.isInclusive || adj.value === 0) return;
      
      const adjustmentAmount = adj.mode === 'percentage' 
        ? Math.round(subtotal * (adj.value / 100))
        : Math.round(adj.value);
      
      const multiplier = adj.type === 'discount' ? -1 : 1;
      const splits = splitCents(adjustmentAmount, bill.participants.map(p => {
        const summary = summaries.get(p.id);
        return summary?.itemsTotal || 0;
      }));
      bill.participants.forEach((p, idx) => {
        const summary = summaries.get(p.id);
        if (summary) summary.adjustmentsShare += splits[idx] * multiplier;
      });
    });
  }

  // Step 4: Calculate grand totals with rounding
  summaries.forEach(summary => {
    summary.grandTotal = summary.itemsTotal + summary.adjustmentsShare;
  });

  // Step 5: Handle rounding remainder
  const calculatedTotal = Array.from(summaries.values())
    .reduce((sum, s) => sum + s.grandTotal, 0);
  const actualTotal = calculateGrandTotal(bill);
  const remainder = actualTotal - calculatedTotal;
  
  if (Math.abs(remainder) >= 1) {
    const first = summaries.values().next().value;
    if (first) {
      first.grandTotal = first.grandTotal + remainder;
    }
  }

  // Step 6: Apply payments and calculate net owed
  bill.payments.forEach(payment => {
    const summary = summaries.get(payment.payerId);
    if (summary) {
      const paymentAmount = typeof payment.amountMinor === 'number'
        ? payment.amountMinor
        : typeof payment.amountCents === 'number'
          ? payment.amountCents
          : Math.round((payment.amount || 0) * 100);
      summary.amountPaid += paymentAmount;
    }
  });

  summaries.forEach(summary => {
    summary.netOwed = summary.grandTotal - summary.amountPaid;
  });

  return Array.from(summaries.values());
}

/**
 * Calculate minimal transfers to settle up
 */
export function calculateSettleUp(
  summaries: PersonSummary[],
  participants: Participant[]
): Transfer[] {
  // Create balance map: positive = owed money, negative = owes money
  const balances = summaries.map(s => ({
    id: s.participantId,
    name: s.participantName,
    balance: s.amountPaid - s.grandTotal, // paid - owed
  }));

  const debtors = balances
    .filter(b => b.balance < -1)
    .sort((a, b) => a.balance - b.balance); // Most in debt first

  const creditors = balances
    .filter(b => b.balance > 1)
    .sort((a, b) => b.balance - a.balance); // Owed most first

  const transfers: Transfer[] = [];

  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    
    const amount = Math.min(-debtor.balance, creditor.balance);
    
    if (amount >= 1) {
      transfers.push({
        from: debtor.id,
        fromName: debtor.name,
        to: creditor.id,
        toName: creditor.name,
        amount,
      });
    }
    
    debtor.balance += amount;
    creditor.balance -= amount;
    
    if (Math.abs(debtor.balance) < 1) d++;
    if (Math.abs(creditor.balance) < 1) c++;
  }

  return transfers;
}

/**
 * Generate share text summary
 */
export function generateShareText(bill: Bill, summaries: PersonSummary[]): string {
  const lines: string[] = [];
  
  lines.push(`📋 ${bill.name || 'Bill Split'}`);
  lines.push(`Date: ${bill.createdAt.toLocaleDateString()}`);
  lines.push('');
  lines.push('─'.repeat(30));
  lines.push('');
  
  summaries.forEach(s => {
    lines.push(`${s.participantName}: ${formatCurrency(s.grandTotal, bill.currencyCode || bill.currency || 'USD', bill.currencyLocale)}`);
  });
  
  lines.push('');
  lines.push('─'.repeat(30));
  lines.push(`Total: ${formatCurrency(calculateGrandTotal(bill), bill.currencyCode || bill.currency || 'USD', bill.currencyLocale)}`);
  lines.push('');
  lines.push('Split with BillSplit Pro');
  
  return lines.join('\n');
}
