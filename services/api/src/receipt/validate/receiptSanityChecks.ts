/**
 * Receipt-Level Sanity Checks
 * 
 * Applies receipt-level intelligence to validate and flag suspicious items.
 * Uses context from entire receipt to make better decisions.
 */

export interface ReceiptContext {
  items: Array<{
    quantity: number;
    itemName: string;
    unitPrice: number | null;
    lineTotal: number;
  }>;
  receiptTotal?: number;
  subtotal?: number;
}

export interface SanityCheckResult {
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
  suggestedCorrections?: Array<{
    field: 'quantity' | 'unitPrice' | 'lineTotal';
    originalValue: number;
    suggestedValue: number;
    reason: string;
  }>;
}

/**
 * Check item sanity with receipt-level context
 * 
 * Rules:
 * 1. If unit_price < 1.00 AND item_name is food → suspicious
 * 2. If line_total > receipt_total → invalid
 * 3. Prefer prices ending with common cents (.95, .90, .50)
 * 4. If qty missing but line_total matches other items → qty=1 is likely
 * 5. Never silently "fix" - only suggest with explanation
 */
export function checkReceiptItemSanity(
  item: {
    quantity: number;
    itemName: string;
    unitPrice: number | null;
    lineTotal: number;
    originalLine: string;
  },
  context: ReceiptContext
): SanityCheckResult {
  const reviewReasons: string[] = [];
  const suggestedCorrections: Array<{
    field: 'quantity' | 'unitPrice' | 'lineTotal';
    originalValue: number;
    suggestedValue: number;
    reason: string;
  }> = [];
  
  let confidence = 0.8; // Base confidence

  // Rule 1: Unit price sanity for food items
  if (item.unitPrice !== null && item.unitPrice < 1.00) {
    const foodKeywords = ['burger', 'chicken', 'steak', 'lasagna', 'smoothie', 'coffee', 'drink', 'chips'];
        const isFoodItem = foodKeywords.some(keyword => 
      item.itemName.toLowerCase().includes(keyword)
    );
    
    if (isFoodItem) {
      reviewReasons.push(`Unit price ($${item.unitPrice.toFixed(2)}) seems too low for a food item`);
      confidence = Math.min(confidence, 0.5);
      
      // Suggest correction: might be missing leading digit
      // e.g., 0.95 → 25.95 (if other items are ~20-30 range)
      if (context.items.length > 0) {
        const otherItems = context.items.filter(i => i.lineTotal !== item.lineTotal);
        if (otherItems.length > 0) {
          const avgPrice = otherItems.reduce((sum, i) => sum + i.lineTotal, 0) / otherItems.length;
          if (avgPrice > 10 && avgPrice < 50) {
            // Try adding leading "2" (common pattern)
            const suggested = parseFloat(`2${item.unitPrice.toFixed(2)}`);
            if (suggested > 10 && suggested < 50) {
              suggestedCorrections.push({
                field: 'unitPrice',
                originalValue: item.unitPrice,
                suggestedValue: suggested,
                reason: `Missing leading digit? ${item.unitPrice.toFixed(2)} → ${suggested.toFixed(2)}`,
              });
            }
          }
        }
      }
    }
  }

  // Rule 2: Line total vs receipt total
  if (context.receiptTotal && item.lineTotal > context.receiptTotal * 1.1) {
    reviewReasons.push(
      `Line total ($${item.lineTotal.toFixed(2)}) exceeds receipt total ($${context.receiptTotal.toFixed(2)})`
    );
    confidence = Math.min(confidence, 0.3);
  }

  // Rule 3: Prefer common cents patterns
  const cents = Math.round((item.lineTotal % 1) * 100);
  const commonCents = [95, 90, 50, 99, 0];
  if (!commonCents.includes(cents)) {
    // Not necessarily wrong, but less common
    // Only flag if other items have common cents
    if (context.items.length > 0) {
      const otherItems = context.items.filter(i => i.lineTotal !== item.lineTotal);
      if (otherItems.length > 0) {
        const otherCents = otherItems.map(i => Math.round((i.lineTotal % 1) * 100));
        const hasCommonCents = otherCents.some(c => commonCents.includes(c));
        
        if (hasCommonCents) {
          reviewReasons.push(`Price ends with uncommon cents (.${cents}) - may be OCR error`);
          confidence = Math.min(confidence, 0.7);
        }
      }
    }
  }

  // Rule 4: Quantity sanity
  if (item.quantity > 6) {
    reviewReasons.push(`Unusually high quantity (${item.quantity}) - may be OCR error`);
    confidence = Math.min(confidence, 0.5);
  }

  // Rule 5: Magnitude check
  if (context.items.length > 0) {
    const otherItems = context.items.filter(i => i.lineTotal !== item.lineTotal);
    if (otherItems.length > 0) {
      const avgTotal = otherItems.reduce((sum, i) => sum + i.lineTotal, 0) / otherItems.length;
      const maxTotal = Math.max(...otherItems.map(i => i.lineTotal));
      
      // Check if this item is way outside the normal range
      if (item.lineTotal > maxTotal * 2) {
        reviewReasons.push(
          `Price ($${item.lineTotal.toFixed(2)}) is much higher than other items (max: $${maxTotal.toFixed(2)})`
        );
        confidence = Math.min(confidence, 0.4);
      }
      
      // Check for order of magnitude errors
      const magnitudeRatio = item.lineTotal / avgTotal;
      if (magnitudeRatio > 5) {
        reviewReasons.push(`Price appears to be an order of magnitude off (${magnitudeRatio.toFixed(1)}x average)`);
        confidence = Math.min(confidence, 0.5);
      }
    }
  }

  // Rule 6: Quantity mismatch (if unit price exists)
  if (item.quantity > 1 && item.unitPrice !== null && item.unitPrice > 0) {
    const expectedTotal = item.quantity * item.unitPrice;
    const difference = Math.abs(item.lineTotal - expectedTotal);
    
    if (difference > 0.02) {
      reviewReasons.push(
        `Quantity mismatch: ${item.quantity} × $${item.unitPrice.toFixed(2)} = $${expectedTotal.toFixed(2)}, but line total is $${item.lineTotal.toFixed(2)}`
      );
      confidence = Math.min(confidence, 0.6);
    }
  }

  const needsReview = reviewReasons.length > 0 || confidence < 0.7;

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    needsReview,
    reviewReasons,
    suggestedCorrections: suggestedCorrections.length > 0 ? suggestedCorrections : undefined,
  };
}
