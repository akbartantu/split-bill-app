/**
 * Receipt Line Reconstruction
 * 
 * Reconstructs receipt lines using column-aware logic for thermal receipts.
 * Structure: [QTY] [ITEM NAME] [UNIT PRICE] [LINE TOTAL]
 * 
 * Uses RULES, not guesses:
 * - Extract qty ONLY from line start
 * - Extract ALL money tokens
 * - ITEM NAME = text between qty and first price
 * - UNIT PRICE = first price if qty > 1 and >=2 prices
 * - LINE TOTAL = last price (or single price if qty == 1)
 */

import { extractCanonicalName } from './extractCanonicalName';

export interface ReconstructedLine {
  quantity: number;
  itemName: string;
  unitPrice: number | null;
  lineTotal: number;
  originalLine: string;
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
}

/**
 * Reconstruct a receipt line using column-aware logic
 * 
 * Rules:
 * 1. QTY: Extract ONLY from line start: ^\d+x
 * 2. MONEY: Extract ALL tokens matching \d+\.\d{2}
 * 3. ITEM NAME: Text between qty and first price (cleaned)
 * 4. UNIT PRICE: If qty > 1 and >=2 prices → first price
 * 5. LINE TOTAL: If >=2 prices → last price, else single price
 * 6. VALIDATE: If qty>1 and line_total ≠ qty*unit_price (±0.02) → needs_review
 */
export function reconstructReceiptLine(
  normalizedLine: string,
  originalLine: string
): ReconstructedLine | null {
  // Skip if looks like header or separator
  if (normalizedLine.length < 3 || /^-+$/.test(normalizedLine) || /^=+$/.test(normalizedLine)) {
    return null;
  }

  // Skip if looks like a total line
  if (/total|subtotal|tax|gst|vat|service|tip|balance|amount\s*due/i.test(normalizedLine)) {
    return null;
  }

  const line = normalizedLine.trim();
  const reviewReasons: string[] = [];
  let confidence = 0.8; // Base confidence
  
  // Step 1: Extract quantity ONLY from line start
  let quantity = 1;
  const qtyMatch = line.match(/^\s*(\d+)\s*[xX]\s+/);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1]);
    if (quantity > 10) {
      // Suspiciously high quantity
      reviewReasons.push(`Unusually high quantity: ${quantity}`);
      confidence = Math.min(confidence, 0.5);
    }
  }

  // Step 2: Extract ALL money tokens
  const pricePattern = /\b(\d{1,3}\.\d{2})\b/g;
  const priceMatches = Array.from(line.matchAll(pricePattern));
  const prices = priceMatches.map(m => parseFloat(m[1]));

  if (prices.length === 0) {
    // No price found - not a valid item line
    return null;
  }

  // Step 3: Extract item name (text between qty and first price)
  let name = line;
  
  // Remove quantity prefix if found
  if (qtyMatch) {
    name = name.replace(qtyMatch[0], '');
  }
  
  // Remove all price tokens
  for (const price of prices) {
    const priceStr = price.toFixed(2);
    // Remove price with optional $ and whitespace
    name = name.replace(new RegExp(`\\$?\\s*${priceStr.replace('.', '\\.')}\\b`), '').trim();
  }
  
  // Clean name using canonical extraction
  name = extractCanonicalName(name);
  
  // Validate name
  if (name.length < 2 || name.length > 100) {
    return null;
  }

  // Step 4: Determine unit price and line total using column logic
  let unitPrice: number | null = null;
  let lineTotal: number;

  if (prices.length === 1) {
    // Single price: treat as line total
    lineTotal = prices[0];
    if (quantity > 1) {
      // Calculate unit price
      unitPrice = lineTotal / quantity;
    }
  } else if (prices.length >= 2) {
    // Multiple prices: use column logic
    if (quantity > 1) {
      // With quantity: first = unit, last = total
      unitPrice = prices[0];
      lineTotal = prices[prices.length - 1];
      
      // Validate: line_total should be approximately qty * unit_price
      const expectedTotal = unitPrice * quantity;
      const tolerance = 0.02; // 2 cents
      const difference = Math.abs(lineTotal - expectedTotal);
      
      if (difference > tolerance) {
        reviewReasons.push(
          `Quantity mismatch: ${quantity} × $${unitPrice.toFixed(2)} = $${expectedTotal.toFixed(2)}, but line total is $${lineTotal.toFixed(2)}`
        );
        confidence = Math.min(confidence, 0.6);
      }
    } else {
      // No quantity: use last price as line total
      lineTotal = prices[prices.length - 1];
      // If two prices and no qty, might be unit + total (unusual but possible)
      if (prices.length === 2) {
        // Prefer last as total (common receipt pattern)
        lineTotal = prices[1];
      }
    }
  } else {
    // Should not happen (prices.length === 0 already handled)
    return null;
  }

  // Step 5: Validate prices
  if (lineTotal <= 0 || (unitPrice !== null && unitPrice <= 0)) {
    return null;
  }

  // Step 6: Determine if review needed
  const needsReview = reviewReasons.length > 0 || confidence < 0.7;

  return {
    quantity,
    itemName: name,
    unitPrice,
    lineTotal,
    originalLine,
    confidence,
    needsReview,
    reviewReasons,
  };
}
