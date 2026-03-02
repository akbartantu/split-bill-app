/**
 * Robust Line Item Parser (Server-Side)
 * 
 * Correctly extracts quantity, unit price, and line total from receipt lines.
 * Matches client-side implementation for consistency.
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
  let quantity = 1;
  let quantityMatch: RegExpMatchArray | null = null;
  
  quantityMatch = originalLine.match(/^\s*(\d+)\s*[xX]\s+/);
  if (quantityMatch) {
    quantity = parseInt(quantityMatch[1]);
  } else {
    quantityMatch = originalLine.match(/\b(\d+)\s*[xX]\s+/);
    if (quantityMatch) {
      quantity = parseInt(quantityMatch[1]);
    }
  }

  // Step 2: Extract all money-like tokens
  const pricePattern = /\$?\s*(\d+[.,]\d{2})\b/g;
  const priceMatches = Array.from(originalLine.matchAll(pricePattern));
  const prices = priceMatches.map(m => m[1].replace(',', '.'));

  if (prices.length === 0) {
    return null;
  }

  // Step 3: Extract canonical item name using dedicated function
  let name = extractCanonicalName(originalLine);

  if (name.length < 2 || name.length > 100) {
    return null;
  }

  // Step 4: Determine unit price and line total
  let unitPrice: number | null = null;
  let lineTotal: number;

  if (prices.length === 1) {
    lineTotal = parseFloat(prices[0]);
    if (quantity > 1) {
      unitPrice = lineTotal / quantity;
    }
  } else if (prices.length === 2 && quantity > 1) {
    unitPrice = parseFloat(prices[0]);
    lineTotal = parseFloat(prices[1]);
    
    const expectedTotal = unitPrice * quantity;
    const tolerance = 0.01;
    if (Math.abs(lineTotal - expectedTotal) > tolerance) {
      const altUnitPrice = parseFloat(prices[1]);
      const altLineTotal = parseFloat(prices[0]);
      const altExpectedTotal = altUnitPrice * quantity;
      
      if (Math.abs(altLineTotal - altExpectedTotal) < Math.abs(lineTotal - expectedTotal)) {
        unitPrice = altUnitPrice;
        lineTotal = altLineTotal;
      }
    }
  } else {
    lineTotal = parseFloat(prices[prices.length - 1]);
    if (prices.length >= 2 && quantity > 1) {
      unitPrice = parseFloat(prices[prices.length - 2]);
    }
  }

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

function cleanItemName(name: string): string {
  name = name
    .replace(/\s+[a-zA-Z]{1,2}\s*$/, '')
    .replace(/[.\-_]+\s*$/, '')
    .replace(/\s+\d{1,2}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  name = name.replace(/^[^a-zA-Z0-9&]+|[^a-zA-Z0-9&]+$/g, '');

  return name.trim();
}
