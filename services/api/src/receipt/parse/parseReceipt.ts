/**
 * Receipt Parsing Module (Server-Side)
 * 
 * Parses OCR text into structured receipt data with validation.
 * Now uses improved parsing with sanity checks and auto-correction.
 */

import { createError } from '../../middleware/errorHandler';
import { parseLineItem } from './parseLineItems';
import { checkItemSanity } from '../validate/sanityChecks';
import { autoCorrectAmount } from '../validate/autoCorrectAmounts';
import { normalizeOcrLine } from './normalizeOcrLine';
import { reconstructReceiptLine } from './reconstructReceiptLine';

export interface ParsedReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  confidence: number;
  needsReview: boolean;
  rawText?: string;
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
  items: ParsedReceiptItem[];
  subtotal?: number;
  tax?: number;
  serviceCharge?: number;
  total?: number;
  confidence: number;
  rawText: string;
}

/**
 * Parse receipt text with validation
 */
export function parseReceipt(
  ocrText: string,
  ocrConfidence: number
): ParsedReceipt {
  try {
    const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const items: ParsedReceiptItem[] = [];
    let subtotal: number | undefined;
    let total: number | undefined;
    
    // Parse totals first
    const totalPattern = /\b(total|amount\s*due|balance|grand\s*total)\b/i;
    const subtotalPattern = /sub\s*-?\s*total|subtotal/i;
    const pricePattern = /\$?\s*(\d+[.,]\d{2})\s*$/;
    
    for (const line of lines) {
      if (totalPattern.test(line)) {
        const match = line.match(pricePattern);
        if (match) {
          total = parseFloat(match[1].replace(',', '.'));
        }
      } else if (subtotalPattern.test(line)) {
        const match = line.match(pricePattern);
        if (match) {
          subtotal = parseFloat(match[1].replace(',', '.'));
        }
      }
    }
    
    // Parse items using improved parser with reconstruction
    // Try new reconstruction first, fall back to old parser
    for (const line of lines) {
      // Skip total lines
      if (totalPattern.test(line) || subtotalPattern.test(line)) {
        continue;
      }
      
      // Normalize the line first (fix OCR errors)
      const normalized = normalizeOcrLine(line);
      
      // Try reconstruction (new method)
      const reconstructed = reconstructReceiptLine(normalized.normalized, normalized.original);
      if (reconstructed) {
        items.push({
          id: generateId(),
          name: reconstructed.itemName,
          quantity: reconstructed.quantity,
          unitPrice: reconstructed.unitPrice || (reconstructed.quantity > 0 ? reconstructed.lineTotal / reconstructed.quantity : 0),
          totalPrice: reconstructed.lineTotal,
          confidence: reconstructed.confidence,
          needsReview: reconstructed.needsReview,
          rawText: normalized.original,
          reviewReasons: reconstructed.reviewReasons,
        });
        continue;
      }
      
      // Fall back to old parser
      const lineItem = parseLineItem(normalized.normalized);
      if (lineItem) {
        items.push({
          id: generateId(),
          name: lineItem.itemName,
          quantity: lineItem.quantity,
          unitPrice: lineItem.unitPrice || (lineItem.quantity > 0 ? lineItem.lineTotal / lineItem.quantity : 0),
          totalPrice: lineItem.lineTotal,
          confidence: ocrConfidence * 0.8, // Base confidence
          needsReview: false,
          rawText: normalized.original, // Keep original OCR line for debugging
        });
      }
    }
    
    // Run sanity checks and auto-correction
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

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        const sanityResult = checkItemSanity(
          {
            quantity: item.quantity,
            itemName: item.name,
            unitPrice: item.unitPrice,
            lineTotal: item.totalPrice,
            originalLine: '', // Not available in server context
          },
          context
        );

        item.confidence = Math.min(item.confidence, sanityResult.confidence);
        item.needsReview = sanityResult.needsReview;
        item.reviewReasons = sanityResult.reviewReasons;

        if (sanityResult.isSuspicious && item.totalPrice > 0) {
          const correction = autoCorrectAmount(item.totalPrice, context);
          
          if (correction.corrected && correction.confidence > 0.6) {
            const oldTotal = item.totalPrice;
            item.totalPrice = correction.correctedValue;
            
            if (item.quantity > 0) {
              item.unitPrice = item.totalPrice / item.quantity;
            }

            item.correctionMetadata = {
              originalValue: correction.originalValue,
              correctedValue: correction.correctedValue,
              correctionType: correction.correctionType,
            };

            item.confidence = Math.min(1, item.confidence + 0.1);
            
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
    
    // Validate parsed data
    const validItems = items.filter(item => {
      return item.name.length >= 2 && 
             item.quantity > 0 && 
             item.unitPrice >= 0 && 
             item.totalPrice >= 0;
    });
    
    return {
      items: validItems,
      confidence: ocrConfidence,
      rawText: ocrText,
    };
  } catch (error: any) {
    console.warn('[ParseReceipt] Parsing failed:', error.message);
    return {
      items: [],
      confidence: ocrConfidence,
      rawText: ocrText,
    };
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}
