/**
 * Robust Line Item Parser
 * 
 * Correctly extracts quantity, unit price, and line total from receipt lines.
 * Handles various receipt formats including OCR errors.
 */

import { extractCanonicalName } from './extractCanonicalName';

export interface ParsedLineItem {
  quantity: number;
  itemName: string;
  unitPrice: number | null;
  lineTotal: number;
  originalLine: string;
  extractedTokens: {
    quantity?: string;
    prices: string[];
    nameTokens: string[];
  };
}

/**
 * Parse a single receipt line into structured item data
 * 
 * Handles formats:
 * - "1x ITEM NAME 10.50"
 * - "2x ITEM NAME 29.95 59.90" (qty, unit price, line total)
 * - "ITEM NAME 4.95" (no qty; treat qty=1)
 * - "CHICKEN FORESTER 2x 29.95 59.90" (qty in middle)
 */
export function parseLineItem(line: string): ParsedLineItem | null {
  // Skip if looks like header or separator
  if (line.length < 3 || /^-+$/.test(line) || /^=+$/.test(line)) {
    return null;
  }

  // Skip if looks like a total line
  if (/total|subtotal|tax|gst|vat|service|tip|balance|amount\s*due/i.test(line)) {
    return null;
  }

  const originalLine = line.trim();
  
  // Step 1: Extract quantity (if present)
  // Pattern: ^\s*(\d+)\s*x\b (at start) or \b(\d+)\s*x\b (anywhere)
  let quantity = 1;
  let quantityMatch: RegExpMatchArray | null = null;
  
  // Try at start first (most common)
  quantityMatch = originalLine.match(/^\s*(\d+)\s*[xX]\s+/);
  if (quantityMatch) {
    quantity = parseInt(quantityMatch[1]);
  } else {
    // Try in middle (e.g., "ITEM 2x 29.95")
    quantityMatch = originalLine.match(/\b(\d+)\s*[xX]\s+/);
    if (quantityMatch) {
      quantity = parseInt(quantityMatch[1]);
    }
  }

  // Step 2: Extract all money-like tokens
  // Pattern: \d+\.\d{2} or \d+,\d{2} (with optional $ prefix)
  const pricePattern = /\$?\s*(\d+[.,]\d{2})\b/g;
  const priceMatches = Array.from(originalLine.matchAll(pricePattern));
  const prices = priceMatches.map(m => m[1].replace(',', '.'));

  if (prices.length === 0) {
    // No price found - not a valid item line
    return null;
  }

  // Step 3: Extract canonical item name using dedicated function
  let name = extractCanonicalName(originalLine);

  // Validate name
  if (name.length < 2 || name.length > 100) {
    return null;
  }

  // Step 4: Determine unit price and line total
  let unitPrice: number | null = null;
  let lineTotal: number;

  if (prices.length === 1) {
    // Single price: treat as line total
    lineTotal = parseFloat(prices[0]);
    if (quantity > 1) {
      // Calculate unit price
      unitPrice = lineTotal / quantity;
    }
  } else if (prices.length === 2 && quantity > 1) {
    // Two prices with quantity: first is unit, last is total
    unitPrice = parseFloat(prices[0]);
    lineTotal = parseFloat(prices[1]);
    
    // Validate: line total should be approximately qty * unit price
    const expectedTotal = unitPrice * quantity;
    const tolerance = 0.01; // 1 cent
    if (Math.abs(lineTotal - expectedTotal) > tolerance) {
      // Mismatch - might be wrong interpretation
      // Try reverse: last is unit, first is total
      const altUnitPrice = parseFloat(prices[1]);
      const altLineTotal = parseFloat(prices[0]);
      const altExpectedTotal = altUnitPrice * quantity;
      
      if (Math.abs(altLineTotal - altExpectedTotal) < Math.abs(lineTotal - expectedTotal)) {
        // Reverse interpretation is better
        unitPrice = altUnitPrice;
        lineTotal = altLineTotal;
      }
    }
  } else {
    // Multiple prices: use last as line total, second-to-last as unit price (if qty > 1)
    lineTotal = parseFloat(prices[prices.length - 1]);
    if (prices.length >= 2 && quantity > 1) {
      unitPrice = parseFloat(prices[prices.length - 2]);
    }
  }

  // Validate prices
  if (lineTotal <= 0 || (unitPrice !== null && unitPrice <= 0)) {
    return null;
  }

  return {
    quantity,
    itemName: name,
    unitPrice,
    lineTotal,
    originalLine,
    extractedTokens: {
      quantity: quantityMatch ? quantityMatch[1] : undefined,
      prices,
      nameTokens: name.split(/\s+/),
    },
  };
}

/**
 * Clean item name by removing OCR garbage
 * 
 * Removes:
 * - Trailing single letters (a, A, aa)
 * - Trailing punctuation (., -, _)
 * - Repeated punctuation
 * - Stray digits at end (unless part of name like "2XL")
 */
function cleanItemName(name: string): string {
  // Remove trailing junk patterns
  name = name
    // Remove trailing single/double letters (aa, a, A)
    .replace(/\s+[a-zA-Z]{1,2}\s*$/, '')
    // Remove trailing punctuation
    .replace(/[.\-_]+\s*$/, '')
    // Remove trailing digits that look like OCR noise (not part of name)
    .replace(/\s+\d{1,2}\s*$/, '')
    // Remove repeated spaces
    .replace(/\s+/g, ' ')
    .trim();

  // Remove leading/trailing special chars but preserve & and spaces
  name = name.replace(/^[^a-zA-Z0-9&]+|[^a-zA-Z0-9&]+$/g, '');

  return name.trim();
}
