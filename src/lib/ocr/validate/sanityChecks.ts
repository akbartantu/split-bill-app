/**
 * Sanity Checks for Parsed Receipt Items
 * 
 * Detects suspicious values that may indicate OCR errors:
 * - Magnitude errors (orders of magnitude off)
 * - Quantity mismatches
 * - Name noise (garbage suffixes)
 */

export interface ItemContext {
  quantity: number;
  itemName: string;
  unitPrice: number | null;
  lineTotal: number;
  originalLine: string;
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

export interface SanityCheckResult {
  isSuspicious: boolean;
  needsReview: boolean;
  confidence: number;
  reviewReasons: string[];
}

/**
 * Check if an item has suspicious values that suggest OCR errors
 */
export function checkItemSanity(
  item: ItemContext,
  context: ReceiptContext
): SanityCheckResult {
  const reasons: string[] = [];
  let confidence = 1.0;
  let isSuspicious = false;

  // Rule 1: Magnitude check
  // If line total is orders of magnitude different from other items, flag it
  if (context.items.length > 0 && item.lineTotal > 0) {
    const otherItems = context.items.filter(i => i.lineTotal > 0);
    if (otherItems.length > 0) {
      const avgItemTotal = otherItems.reduce((sum, i) => sum + i.lineTotal, 0) / otherItems.length;
      const maxItemTotal = Math.max(...otherItems.map(i => i.lineTotal));
      const minItemTotal = Math.min(...otherItems.map(i => i.lineTotal));

      // Check if this item is way outside the normal range
      if (item.lineTotal > maxItemTotal * 2) {
        isSuspicious = true;
        confidence = Math.min(confidence, 0.4);
        reasons.push(`Price (${item.lineTotal.toFixed(2)}) is much higher than other items (max: ${maxItemTotal.toFixed(2)})`);
      }

      // Check if it's an order of magnitude off (e.g., 529.95 vs 29.95)
      const magnitudeRatio = item.lineTotal / avgItemTotal;
      if (magnitudeRatio > 5 || magnitudeRatio < 0.2) {
        isSuspicious = true;
        confidence = Math.min(confidence, 0.5);
        reasons.push(`Price appears to be an order of magnitude off (${magnitudeRatio.toFixed(1)}x average)`);
      }
    }

    // Check against receipt total if available
    if (context.receiptTotal && item.lineTotal > context.receiptTotal * 1.2) {
      isSuspicious = true;
      confidence = Math.min(confidence, 0.3);
      reasons.push(`Price (${item.lineTotal.toFixed(2)}) exceeds receipt total (${context.receiptTotal.toFixed(2)})`);
    }
  }

  // Rule 2: Quantity sanity
  // If qty > 6 for typical dining receipts, likely OCR error
  if (item.quantity > 6 && context.items.length > 0) {
    // Check if there's evidence in original line for different quantity
    // For now, flag as suspicious
    isSuspicious = true;
    confidence = Math.min(confidence, 0.5);
    reasons.push(`Unusually high quantity (${item.quantity}) - may be OCR error`);
  }

  // Rule 2b: Quantity mismatch
  // If qty > 1 and we have unit price, verify: qty * unitPrice ≈ lineTotal
  if (item.quantity > 1 && item.unitPrice !== null && item.unitPrice > 0) {
    const expectedTotal = item.quantity * item.unitPrice;
    const difference = Math.abs(item.lineTotal - expectedTotal);
    
    // Allow small rounding differences (up to 2 cents)
    if (difference > 0.02) {
      isSuspicious = true;
      confidence = Math.min(confidence, 0.6);
      reasons.push(
        `Quantity mismatch: ${item.quantity} × $${item.unitPrice.toFixed(2)} = $${expectedTotal.toFixed(2)}, but line total is $${item.lineTotal.toFixed(2)}`
      );
    }
  }

  // Rule 3: Name noise detection
  // Check for garbage suffixes like "aa", single letters, or repeated punctuation
  const nameNoisePatterns = [
    /\s+aa\s*$/i,           // "ITEM aa"
    /\s+[a-z]{1,2}\s*$/i,    // "ITEM a" or "ITEM ab"
    /[\.\-]{2,}$/,           // "ITEM.." or "ITEM---"
    /\s+[A-Z]{1,2}\s*$/,     // "ITEM A" or "ITEM AB" (likely OCR garbage)
  ];

  for (const pattern of nameNoisePatterns) {
    if (pattern.test(item.itemName)) {
      isSuspicious = true;
      confidence = Math.min(confidence, 0.7);
      reasons.push(`Item name may contain garbage suffix: "${item.itemName}"`);
      break;
    }
  }

  // Rule 4: Unit price sanity
  // If unit price is provided, it should be reasonable
  if (item.unitPrice !== null) {
    if (item.unitPrice < 0) {
      isSuspicious = true;
      confidence = Math.min(confidence, 0.3);
      reasons.push('Unit price is negative');
    }
    
    // Very high unit prices might indicate OCR error
    if (item.unitPrice > 1000 && context.items.length > 0) {
      const avgUnitPrice = context.items
        .filter(i => i.unitPrice !== null && i.unitPrice > 0)
        .reduce((sum, i) => sum + (i.unitPrice || 0), 0) / 
        context.items.filter(i => i.unitPrice !== null && i.unitPrice > 0).length;
      
      if (avgUnitPrice > 0 && item.unitPrice > avgUnitPrice * 10) {
        isSuspicious = true;
        confidence = Math.min(confidence, 0.4);
        reasons.push(`Unit price (${item.unitPrice.toFixed(2)}) is unusually high`);
      }
    }
  }

  // Determine if review is needed
  const needsReview = isSuspicious || confidence < 0.6;

  return {
    isSuspicious,
    needsReview,
    confidence: Math.max(0, confidence),
    reviewReasons: reasons,
  };
}
