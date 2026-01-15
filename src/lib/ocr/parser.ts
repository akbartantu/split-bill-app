/**
 * Robust Receipt Parser
 * 
 * Parses OCR text into structured receipt data, handling OCR errors
 * and various receipt formats.
 * 
 * Now includes:
 * - Improved line item parsing
 * - Sanity checks for suspicious values
 * - Auto-correction with metadata tracking
 */

import type { OCRResult } from './engine';
import { parseLineItem } from './parseLineItems';
import { checkItemSanity } from './validate/sanityChecks';
import { autoCorrectAmount } from './validate/autoCorrectAmounts';
import { normalizeOcrLine } from './normalizeOcrLine';

export interface ParsedItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  confidence: number;
  needsReview: boolean;
  rawText: string;
  reviewReasons?: string[];
  correctionMetadata?: {
    originalValue: number;
    correctedValue: number;
    correctionType: string;
  };
}

export interface ParsedReceipt {
  merchant?: string;
  date?: string;
  items: ParsedItem[];
  subtotal?: number;
  tax?: number;
  serviceCharge?: number;
  total?: number;
  confidence: number;
  rawText: string;
  ocrMetadata?: {
    selectedVariant: string;
    selectedPSM: number;
    score: number;
  };
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Fix common OCR character confusions
 */
function fixOCRConfusions(text: string): string {
  // Common OCR errors in receipt context
  // Be careful - only fix when context suggests it's an error
  
  // In price context, O is likely 0
  text = text.replace(/(\d)[Oo](\d)/g, '$10$2'); // e.g., "1O.50" -> "10.50"
  
  // In quantity context, O is likely 0
  text = text.replace(/^([Oo])\s*[xX]/g, '0x'); // e.g., "Ox ITEM" -> "0x ITEM"
  
  // At start of line with x, O is likely 0
  text = text.replace(/^([Oo])\s*x\s+/gi, '0x ');
  
  // In middle of numbers, I is likely 1
  text = text.replace(/(\d)[Ii](\d)/g, '$11$2');
  
  // S at end of number might be 5 (but be careful)
  // Only if followed by space or end
  text = text.replace(/(\d)S(\s|$)/g, '$15$2');
  
  return text;
}

/**
 * Parse receipt text with robust error handling
 */
export function parseReceiptText(
  ocrText: string,
  ocrResult?: OCRResult
): ParsedReceipt {
  // Fix common OCR errors
  const fixedText = fixOCRConfusions(ocrText);
  const lines = fixedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const items: ParsedItem[] = [];
  let subtotal: number | undefined;
  let tax: number | undefined;
  let total: number | undefined;
  let serviceCharge: number | undefined;
  let merchant: string | undefined;
  let date: string | undefined;

  // Patterns
  const pricePattern = /\$?\s*(\d+[.,]\d{2})\s*$/;
  const quantityPattern = /^(\d+)\s*[xX]?\s*/;
  const quantityPricePattern = /^(\d+)\s*[xX]\s*(.+?)\s+\$?\s*(\d+[.,]\d{2})/;
  const itemPricePattern = /^(.+?)\s+\$?\s*(\d+[.,]\d{2})\s*$/;
  
  // Patterns for totals
  const subtotalPattern = /sub\s*-?\s*total|subtotal/i;
  const taxPattern = /\b(tax|vat|gst|hst)\b/i;
  const servicePattern = /service\s*(charge|fee)?|gratuity/i;
  const totalPattern = /\b(total|amount\s*due|balance|grand\s*total)\b/i;
  const datePattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{2,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/;

  // First few lines often contain merchant name
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const line = lines[i];
    if (!pricePattern.test(line) && line.length > 3 && line.length < 50) {
      // Likely merchant name
      if (!merchant) {
        merchant = line;
        break;
      }
    }
  }

  // Parse each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for date
    const dateMatch = line.match(datePattern);
    if (dateMatch && !date) {
      date = dateMatch[0];
      continue;
    }

    // Check for totals first (before items)
    if (subtotalPattern.test(line)) {
      const match = line.match(pricePattern);
      if (match) {
        subtotal = parseFloat(match[1].replace(',', '.'));
      }
      continue;
    }

    if (taxPattern.test(line)) {
      const match = line.match(pricePattern);
      if (match) {
        tax = parseFloat(match[1].replace(',', '.'));
      }
      continue;
    }

    if (servicePattern.test(line)) {
      const match = line.match(pricePattern);
      if (match) {
        serviceCharge = parseFloat(match[1].replace(',', '.'));
      }
      continue;
    }

    if (totalPattern.test(line)) {
      const match = line.match(pricePattern);
      if (match) {
        total = parseFloat(match[1].replace(',', '.'));
      }
      continue;
    }

    // Try to parse as item using improved parser
    const lineItem = parseLineItem(line);
    if (lineItem) {
      // Convert to ParsedItem format
      const parsedItem: ParsedItem = {
        id: generateId(),
        name: lineItem.itemName,
        quantity: lineItem.quantity,
        unitPrice: lineItem.unitPrice,
        totalPrice: lineItem.lineTotal,
        confidence: 0.7, // Base confidence
        needsReview: false,
        rawText: normalized.original, // Keep original OCR line for debugging
      };
      items.push(parsedItem);
    }
  }

  // Run sanity checks and auto-correction on all items
  if (items.length > 0) {
    const context = {
      items: items.map(i => ({
        lineTotal: i.totalPrice,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      receiptTotal: total,
      subtotal,
    };

    // Process each item with sanity checks and corrections
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Run sanity check
      const sanityResult = checkItemSanity(
        {
          quantity: item.quantity,
          itemName: item.name,
          unitPrice: item.unitPrice,
          lineTotal: item.totalPrice,
          originalLine: item.rawText,
        },
        context
      );

      // Update confidence and needsReview
      item.confidence = Math.min(item.confidence, sanityResult.confidence);
      item.needsReview = sanityResult.needsReview;
      item.reviewReasons = sanityResult.reviewReasons;

      // Attempt auto-correction if suspicious
      if (sanityResult.isSuspicious && item.totalPrice > 0) {
        const correction = autoCorrectAmount(item.totalPrice, context);
        
        if (correction.corrected && correction.confidence > 0.6) {
          // Apply correction
          const oldTotal = item.totalPrice;
          item.totalPrice = correction.correctedValue;
          
          // Recalculate unit price if needed
          if (item.unitPrice !== null && item.quantity > 0) {
            item.unitPrice = item.totalPrice / item.quantity;
          } else if (item.quantity > 0) {
            item.unitPrice = item.totalPrice / item.quantity;
          }

          // Store correction metadata
          item.correctionMetadata = {
            originalValue: correction.originalValue,
            correctedValue: correction.correctedValue,
            correctionType: correction.correctionType,
          };

          // Update confidence (correction increases confidence slightly)
          item.confidence = Math.min(1, item.confidence + 0.1);
          
          // Add to review reasons
          if (!item.reviewReasons) {
            item.reviewReasons = [];
          }
          item.reviewReasons.push(
            `Auto-corrected ${correction.correctionType}: ${oldTotal.toFixed(2)} → ${correction.correctedValue.toFixed(2)}`
          );
        }
      }
    }
  }

  // Calculate overall confidence
  const avgItemConfidence = items.length > 0
    ? items.reduce((sum, item) => sum + item.confidence, 0) / items.length
    : 0;
  
  const hasTotal = total !== undefined;
  const itemsSum = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalMatches = hasTotal && Math.abs(itemsSum - (total || 0)) < 2; // Allow $2 tolerance
  
  const confidence = Math.min(1, (
    avgItemConfidence * 0.5 +
    (items.length > 0 ? 0.2 : 0) +
    (hasTotal ? 0.15 : 0) +
    (totalMatches ? 0.15 : 0)
  ));

  return {
    merchant,
    date,
    items,
    subtotal,
    tax,
    serviceCharge,
    total,
    confidence,
    rawText: ocrText,
    ocrMetadata: ocrResult ? {
      selectedVariant: ocrResult.variant,
      selectedPSM: ocrResult.psm,
      score: 0, // Will be set by caller
    } : undefined,
  };
}

/**
 * Legacy parseItemLine - kept for backward compatibility
 * Now delegates to improved parseLineItem
 * 
 * @deprecated Use parseLineItem directly for new code
 */
function parseItemLine(line: string): ParsedItem | null {
  const lineItem = parseLineItem(line);
  if (!lineItem) {
    return null;
  }

  return createParsedItem(
    lineItem.itemName,
    lineItem.quantity,
    lineItem.lineTotal,
    lineItem.unitPrice,
    lineItem.originalLine,
    lineItem.quantity > 1,
    true
  );
}

/**
 * Create a ParsedItem with confidence calculation
 */
function createParsedItem(
  name: string,
  quantity: number,
  totalPrice: number,
  unitPrice: number | null,
  rawText: string,
  hasQuantity: boolean,
  hasPrice: boolean
): ParsedItem {
  let confidence = 0;
  
  // Has quantity: +0.3
  if (hasQuantity) confidence += 0.3;
  
  // Has unit price: +0.2
  if (unitPrice !== null) confidence += 0.2;
  
  // Has line total: +0.3
  if (hasPrice) confidence += 0.3;
  
  // Name is reasonable length: +0.2
  if (name.length >= 3 && name.length <= 50) {
    confidence += 0.2;
  }
  
  // Penalize if name is mostly numbers
  const numberRatio = (name.match(/\d/g) || []).length / name.length;
  if (numberRatio > 0.5) {
    confidence -= 0.3;
  }
  
  // Calculate unit price if not provided
  const calculatedUnitPrice = unitPrice !== null 
    ? unitPrice 
    : (hasQuantity && quantity > 0 ? totalPrice / quantity : null);
  
  return {
    id: generateId(),
    name,
    quantity,
    unitPrice: calculatedUnitPrice,
    totalPrice,
    confidence: Math.max(0, Math.min(1, confidence)),
    needsReview: !hasQuantity || unitPrice === null || confidence < 0.6,
    rawText,
  };
}
