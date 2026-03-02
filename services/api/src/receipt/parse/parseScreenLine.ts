/**
 * Screen-style line parsing (mobile/web order screens)
 */

export interface ScreenParsedLine {
  quantity: number;
  itemName: string;
  unitPrice: number | null;
  lineTotal: number;
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
}

const nonItemPatterns = [
  /payment\s*details/i,
  /\bpayment\b/i,
  /google\s*pay/i,
  /email\s*tax\s*invoice/i,
  /order\s*number/i,
  /placed\s*on/i,
  /table\s*\d+/i,
];

const extrasPattern = /\bextras?\b/i;

export function isNonItemLine(line: string): boolean {
  return nonItemPatterns.some(p => p.test(line));
}

export function extractExtrasAmount(line: string): number | null {
  if (!extrasPattern.test(line)) return null;
  const match = line.match(/(\d+[.,]\d{2})/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

export function shouldAppendToPreviousName(line: string): boolean {
  if (/\d/.test(line)) return false;
  if (/[.,]$/.test(line)) return false;
  if (/^(regular|standard|add|extra|small|large|single|full|warm|iced|sugar)/i.test(line)) {
    return false;
  }
  return line.length >= 3;
}

export function parseScreenLine(normalizedLine: string): ScreenParsedLine | null {
  if (normalizedLine.length < 3) return null;
  if (isNonItemLine(normalizedLine)) return null;
  if (/total|subtotal|tax|gst|vat|service|tip|balance|amount\s*due|processing\s*fee|surcharge/i.test(normalizedLine)) {
    return null;
  }

  // Pattern: $235.67 x 3 nights $707.00
  const unitQtyTotal = normalizedLine.match(/^\$?\s*(\d+[.,]\d{2})\s*[xX]\s*(\d+)\s+(.+?)\s+\$?\s*(\d+[.,]\d{2})\s*$/);
  if (unitQtyTotal) {
    const unit = parseFloat(unitQtyTotal[1].replace(',', '.'));
    const qty = parseInt(unitQtyTotal[2], 10);
    const name = unitQtyTotal[3].trim();
    const total = parseFloat(unitQtyTotal[4].replace(',', '.'));
    return {
      quantity: qty || 1,
      itemName: name,
      unitPrice: unit,
      lineTotal: total,
      confidence: 0.7,
      needsReview: false,
      reviewReasons: [],
    };
  }

  // Pattern: 1 ITEM NAME $10.00 (price at end)
  const trailingPrice = normalizedLine.match(/^(.*?)\s+\$?\s*(\d+[.,]\d{2})\s*$/);
  if (!trailingPrice) return null;

  const namePart = trailingPrice[1].trim();
  const price = parseFloat(trailingPrice[2].replace(',', '.'));

  let quantity = 1;
  let itemName = namePart;
  const qtyMatch = namePart.match(/^\s*(\d+)\s*[xX]?\s+/);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10);
    itemName = namePart.replace(qtyMatch[0], '').trim();
  }

  if (itemName.length < 2) return null;

  return {
    quantity,
    itemName,
    unitPrice: quantity > 0 ? price / quantity : null,
    lineTotal: price,
    confidence: 0.65,
    needsReview: false,
    reviewReasons: [],
  };
}
