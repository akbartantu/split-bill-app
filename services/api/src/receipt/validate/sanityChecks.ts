/**
 * Sanity Checks for Parsed Receipt Items (Server-Side)
 * 
 * Detects suspicious values that likely indicate OCR errors.
 */

export interface SanityCheckResult {
  isSuspicious: boolean;
  needsReview: boolean;
  reviewReasons: string[];
  confidence: number;
}

export interface ReceiptContext {
  items: Array<{
    lineTotal: number;
    quantity: number;
    unitPrice: number | null;
  }>;
  receiptTotal?: number;
  subtotal?: number;
}

export function checkItemSanity(
  item: {
    quantity: number;
    itemName: string;
    unitPrice: number | null;
    lineTotal: number;
    originalLine: string;
  },
  context: ReceiptContext
): SanityCheckResult {
  const reasons: string[] = [];
  let confidence = 1.0;

  if (context.items.length > 0) {
    const otherItems = context.items.filter(i => i.lineTotal !== item.lineTotal);
    if (otherItems.length > 0) {
      const avgItemTotal = otherItems.reduce((sum, i) => sum + i.lineTotal, 0) / otherItems.length;
      const medianItemTotal = [...otherItems]
        .map(i => i.lineTotal)
        .sort((a, b) => a - b)[Math.floor(otherItems.length / 2)];

      const ratio = item.lineTotal / avgItemTotal;
      const medianRatio = item.lineTotal / medianItemTotal;

      if (ratio > 8 && item.lineTotal > 100) {
        reasons.push(`Price seems too high (${item.lineTotal.toFixed(2)} vs avg ${avgItemTotal.toFixed(2)})`);
        confidence -= 0.4;
      }

      if (ratio < 0.15 && avgItemTotal > 10) {
        reasons.push(`Price seems too low (${item.lineTotal.toFixed(2)} vs avg ${avgItemTotal.toFixed(2)})`);
        confidence -= 0.3;
      }

      if (context.receiptTotal) {
        const itemsSum = context.items.reduce((sum, i) => sum + i.lineTotal, 0);
        if (itemsSum > context.receiptTotal * 1.2) {
          if (item.lineTotal > context.receiptTotal * 0.5) {
            reasons.push(`Item total (${item.lineTotal.toFixed(2)}) is large compared to receipt total (${context.receiptTotal.toFixed(2)})`);
            confidence -= 0.3;
          }
        }
      }
    }
  }

  if (item.quantity > 1 && item.unitPrice !== null) {
    const expectedTotal = item.unitPrice * item.quantity;
    const difference = Math.abs(item.lineTotal - expectedTotal);
    const tolerance = 0.02;

    if (difference > tolerance) {
      reasons.push(`Quantity mismatch: ${item.quantity}x $${item.unitPrice.toFixed(2)} = $${expectedTotal.toFixed(2)}, but line total is $${item.lineTotal.toFixed(2)}`);
      confidence -= 0.2;
    }
  }

  const nameNoisePatterns = [
    /\s+[a-zA-Z]{1,2}\s*$/,
    /[.\-_]{2,}$/,
    /\s+\d{1,2}\s*$/,
  ];

  let hasNameNoise = false;
  for (const pattern of nameNoisePatterns) {
    if (pattern.test(item.itemName)) {
      hasNameNoise = true;
      break;
    }
  }

  if (hasNameNoise) {
    reasons.push('Item name contains suspicious trailing characters');
    confidence -= 0.1;
  }

  const priceStr = item.lineTotal.toFixed(2);
  if (priceStr.length > 6) {
    const withoutFirstDigit = parseFloat(priceStr.substring(1));
    if (context.items.length > 0) {
      const avgTotal = context.items.reduce((sum, i) => sum + i.lineTotal, 0) / context.items.length;
      if (Math.abs(withoutFirstDigit - avgTotal) < Math.abs(item.lineTotal - avgTotal)) {
        reasons.push(`Price might have extra leading digit (${item.lineTotal.toFixed(2)} -> ${withoutFirstDigit.toFixed(2)})`);
        confidence -= 0.3;
      }
    }
  }

  if (item.lineTotal === Math.floor(item.lineTotal) && item.lineTotal > 100) {
    reasons.push(`Price is a whole number (${item.lineTotal.toFixed(2)}) - might be missing decimal`);
    confidence -= 0.1;
  }

  const needsReview = confidence < 0.7 || reasons.length > 0;

  return {
    isSuspicious: reasons.length > 0,
    needsReview,
    reviewReasons: reasons,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}
