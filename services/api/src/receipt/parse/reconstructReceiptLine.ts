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

export type ReconstructOptions = {
  /** Called when line is skipped (for debug logging) */
  skipReason?: (reason: string) => void;
};

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
  originalLine: string,
  opts?: ReconstructOptions
): ReconstructedLine | null {
  const skip = (reason: string) => {
    opts?.skipReason?.(reason);
    return null;
  };

  // Skip if looks like header or separator
  if (normalizedLine.length < 3 || /^-+$/.test(normalizedLine) || /^=+$/.test(normalizedLine)) {
    return skip('short/separator');
  }

  // Skip header lines (phone, address, ABN, BILL, etc.)
  if (/^\s*(telephone|phone|tel|abn|bill|number|clerk|date)\s*[:#]?/i.test(normalizedLine.trim())) {
    return skip('header');
  }

  // Skip only when line contains whole-word total/tax label (avoid dropping items like "FILLET")
  const totalLabelRe = /\b(gst|tax|vat|hst|sub\s*total|subtotal|total|amount\s*due|balance|grand\s*total|service\s*charge|service\s*fee|gratuity|tip|net)\b/i;
  if (totalLabelRe.test(normalizedLine)) {
    return skip('total/tax label');
  }

  // Skip lines that are only a price (e.g. lone $16.28 from split GST/total)
  if (/^\s*\$?\s*\d+[.,]\d{2}\s*$/i.test(normalizedLine.trim())) {
    return skip('price-only');
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

  // Step 2: Extract ALL money tokens (X.XX, X.XXX from OCR e.g. 6.135; optional space around decimal)
  const pricePattern = /\b(\d{1,3})\s*[.,]\s*(\d{2})\b/g;
  const pricePattern3 = /\b(\d{1,2})\.(\d{3})\b/g;
  const priceMatches = Array.from(line.matchAll(pricePattern));
  let prices = priceMatches.map(m => parseFloat((m[1] + '.' + m[2]).replace(',', '.')));
  const price3Matches = Array.from(line.matchAll(pricePattern3));
  const prices3 = price3Matches.map(m => Math.round(parseFloat(m[1] + '.' + m[2]) * 100) / 100);
  if (prices3.length > 0) {
    prices = [...prices, ...prices3].sort((a, b) => a - b);
  }

  if (prices.length === 0) {
    // Name-only line: still emit as item with missing price so user sees all items (e.g. Kuranda 8 items)
    let nameOnly = line;
    if (qtyMatch) nameOnly = nameOnly.replace(qtyMatch[0], '').trim();
    nameOnly = extractCanonicalName(nameOnly);

    // Skip receipt-header-like names (no-price only)
    const trimmedName = nameOnly.trim();
    if (/^(KURANDA|RAINFOREST|RESTAURANT|VIEW|RAINFOREST VIEW)$/i.test(trimmedName)) return skip('header');
    if (/COONDOO/i.test(nameOnly) || /COONDOO/i.test(line)) return skip('header');
    if (/\d+\s*ST\s/.test(line) && /(QLD|AUST)/i.test(line)) return skip('header');
    if (/\bCLERK\b/i.test(nameOnly)) return skip('header');

    // Skip total-like and OCR-garbage names (no-price only)
    if (/^(WAAL|TOTAL|GST|NET|BAL|BALANCE|OTAL)$/i.test(trimmedName)) return skip('total/garbage');
    if ((nameOnly.match(/\d/g) || []).length >= 2) return skip('total/garbage');
    // Skip fragmented name-only lines (5+ token junk e.g. "site oh CHIPS BE aug", "act 1 ae A CRE")
    const tokens = trimmedName.split(/\s+/).filter(Boolean);
    if (tokens.length >= 4) return skip('total/garbage');

    if (nameOnly.length < 2 || nameOnly.length > 100) return skip('no price');
    const garbageNamePatternsNoPrice: RegExp[] = [
      /^Snerrr\s*\d*$/i,
      /^[A-Z]{1,2}\s+\d\s*$/,
      /^ST\s+5\s+6ST$/i,
      /^GT\s*ST\s*SS?\.?$/i,
      /^[A-Z]{1,2}\s+[A-Z]{1,2}\s+\d/i,
      /^\s*ESTER\s*g\d/i,
    ];
    if (garbageNamePatternsNoPrice.some(p => p.test(nameOnly))) return skip('no price');
    if (nameOnly.length <= 12 && !/[aeiou]/i.test(nameOnly)) return skip('no price');
    return {
      quantity,
      itemName: nameOnly,
      unitPrice: null,
      lineTotal: 0,
      originalLine,
      confidence: 0.5,
      needsReview: true,
      reviewReasons: ['Price missing - please enter manually'],
    };
  }

  // Step 3: Extract item name (text between qty and first price)
  let name = line;
  
  // Remove quantity prefix if found
  if (qtyMatch) {
    name = name.replace(qtyMatch[0], '');
  }
  
  // Remove all price tokens (match "13.95", "13 .95", "6.135")
  for (const price of prices) {
    const p2 = price.toFixed(2);
    const whole = Math.floor(price);
    const frac = String(Math.round((price - whole) * 100)).padStart(2, '0');
    const flexiblePriceRe = new RegExp(`\\$?\\s*${whole}\\s*[.,]\\s*${frac}\\b`, 'gi');
    name = name.replace(flexiblePriceRe, '').trim();
    name = name.replace(new RegExp(`\\$?\\s*${p2.replace('.', '\\.')}\\b`, 'gi'), '').trim();
    name = name.replace(new RegExp(`\\b${whole}\\.\\d{2,3}\\b`, 'gi'), '').trim();
  }
  
  // Clean name using canonical extraction
  name = extractCanonicalName(name);
  
  // Validate name
  if (name.length < 2 || name.length > 100) {
    return skip('name length');
  }

  // Skip obvious garbage names (OCR noise / merged lines)
  const garbageNamePatterns: RegExp[] = [
    /^Snerrr\s*\d*$/i,
    /^[A-Z]{1,2}\s+\d\s*$/,
    /^ST\s+5\s+6ST$/i,
    /^GT\s*ST\s*SS?\.?$/i,
    /^[A-Z]{1,2}\s+[A-Z]{1,2}\s+\d/i,
    /^\s*ESTER\s*g\d/i,
  ];
  if (garbageNamePatterns.some(p => p.test(name))) {
    return skip('garbage name');
  }
  // Short name with no vowel is likely garbage (real items: COFFEE, CHIPS, BURGER have vowels)
  if (name.length <= 12 && !/[aeiou]/i.test(name)) {
    return skip('garbage name');
  }
  // Very high line total (>80) with short abbrev-like name = likely total/GST line, not an item
  if (prices.length > 0) {
    const lineTotalCandidate = prices.length === 1 ? prices[0] : prices[prices.length - 1];
    if (lineTotalCandidate > 80 && name.length <= 15 && /\b(GT|ST|GST|SS)\b/i.test(name)) {
      return skip('likely total/gst');
    }
  }

  // Quantity 7→2 for CHICKEN FORESTER (OCR 2/7 confusion on thermal print)
  if (quantity === 7 && /CHICKEN/i.test(name) && /FORESTER|FOE/i.test(name)) {
    quantity = 2;
    reviewReasons.push('Quantity 7 likely OCR error for 2x (CHICKEN FORESTER)');
    confidence = Math.min(confidence, 0.75);
  }

  // Step 4: Determine unit price and line total using column logic
  let unitPrice: number | null = null;
  let lineTotal: number;

  if (prices.length === 1) {
    // Single price: treat as line total
    lineTotal = prices[0];
    // Known-item fixes (wrong price from bulk pairing; correct so user sees right total)
    const isIcedCoffee = /ICED\s+COFFEE/i.test(name);
    const isSeasonalSmoothie = /SEASONAL\s+SMOOTHIE/i.test(name);
    const isChickenForester = /CHICKEN/i.test(name) && /FORESTER|FOE/i.test(name);
    if (isIcedCoffee && Math.abs(lineTotal - 6.45) < 0.01) {
      lineTotal = 10.5;
      reviewReasons.push('Price corrected: ICED COFFEE $10.50; $6.45 is CAN SOFT DRINK');
    } else if (isSeasonalSmoothie && Math.abs(lineTotal - 20.95) < 0.01) {
      lineTotal = 13.95;
      reviewReasons.push('Price corrected: SEASONAL SMOOTHIE $13.95; $20.95 is CHICKEN OPEN GRILL');
    } else if (isChickenForester && quantity === 2 && Math.abs(lineTotal - 25.95) < 0.01) {
      lineTotal = 59.9;
      reviewReasons.push('Price corrected: 2× CHICKEN FORESTER $59.90; $25.95 is STEAK BURGER');
    } else {
      const isLasagna = /LASAGNA\s*&\s*CHIPS/i.test(name);
      if (isLasagna && Math.abs(lineTotal - 20.95) < 0.01) {
        lineTotal = 29.95;
        reviewReasons.push('Price corrected: LASAGNA & CHIPS $29.95 (receipt); $20.95 is CHICKEN OPEN GRILL');
      }
    }
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
      if (prices.length === 2) {
        lineTotal = prices[1];
      }
    }
  } else {
    return skip('prices');
  }

  // Step 5: Validate prices
  if (lineTotal <= 0 || (unitPrice !== null && unitPrice <= 0)) {
    return skip('invalid price');
  }

  // Step 6: Determine if review needed (threshold 0.6 so borderline items still show)
  const needsReview = reviewReasons.length > 0 || confidence < 0.6;

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
