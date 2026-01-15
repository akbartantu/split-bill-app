/**
 * Receipt-Aware Scan Service
 * 
 * Deterministic pipeline for thermal restaurant receipts:
 * 1. Document detection & cropping (thermal-optimized)
 * 2. OCR (column-aware, PSM 6/11)
 * 3. Line normalization (fix OCR errors)
 * 4. Line reconstruction (column-aware parsing)
 * 5. Sanity checks (receipt-level intelligence)
 * 6. Canonical output
 */

import { GoogleSheetsClient } from '../../../../../packages/infra-sheets/src/clients/GoogleSheetsClient';
import { detectAndCropReceipt } from '../preprocess/detectAndCropReceipt';
import { runReceiptOCR } from '../ocr/runReceiptOcr';
import { normalizeOcrLine, normalizeOcrLines } from '../parse/normalizeOcrLine';
import { reconstructReceiptLine } from '../parse/reconstructReceiptLine';
import { checkReceiptItemSanity } from '../validate/receiptSanityChecks';
import { createError } from '../../middleware/errorHandler';

export interface CanonicalReceiptItem {
  item_id: string;
  receipt_id?: string;
  quantity: number;
  item_name: string; // FULL, NOT TRUNCATED
  unit_price: number | null;
  line_total: number;
  confidence_score: number;
  needs_review: boolean;
  review_reasons: string[];
  original_ocr_line: string;
}

export interface ScanReceiptResult {
  success: boolean;
  receipt: {
    id: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number | null;
      totalPrice: number;
      confidence: number;
      needsReview: boolean;
      reviewReasons: string[];
      rawText: string;
    }>;
    confidence: number;
    needsReview: boolean;
  };
  merchant?: string;
  date?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  documentDetected?: boolean;
  detectionStrategy?: string;
  message?: string;
}

/**
 * Scan receipt using receipt-aware pipeline
 * 
 * Pipeline:
 * 1. detectAndCropReceipt (thermal-optimized)
 * 2. runReceiptOCR (column-aware, PSM 6/11)
 * 3. normalizeOcrLines (fix OCR errors)
 * 4. reconstructReceiptLine (column-aware parsing)
 * 5. checkReceiptItemSanity (receipt-level intelligence)
 * 6. Return canonical items
 */
export async function scanReceipt(
  imageBuffer: Buffer,
  mimetype: string,
  receiptId?: string,
  sheetsClient?: GoogleSheetsClient,
  requestId?: string
): Promise<ScanReceiptResult> {
  const reqId = requestId || `req_${Date.now()}`;
  const startTime = Date.now();
  
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[ScanReceipt] [${reqId}] Starting receipt-aware scan`, {
      bufferSize: imageBuffer.length,
      mimetype,
    });
  }
  
  try {
    // Step 1: Detect and crop receipt (thermal-optimized)
    const detectStart = Date.now();
    let documentDetected: any;
    try {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ScanReceipt] [${reqId}] Document detection started`);
      }
      documentDetected = await detectAndCropReceipt(imageBuffer, mimetype, reqId);
      const detectDuration = Date.now() - detectStart;
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ScanReceipt] [${reqId}] Document detection completed`, {
          duration: `${detectDuration}ms`,
          detected: documentDetected.documentDetected,
          strategy: documentDetected.strategy,
          confidence: documentDetected.confidence,
        });
      }
    } catch (error: any) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.warn(`[ScanReceipt] [${reqId}] Document detection failed, using original:`, error.message);
      }
      documentDetected = {
        success: true,
        documentDetected: false,
        croppedBuffer: imageBuffer,
        width: 0,
        height: 0,
        strategy: 'fallback',
        confidence: 0,
      };
    }
    
    // Step 2: Run receipt-aware OCR
    const ocrStart = Date.now();
    let ocrResult: any;
    try {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ScanReceipt] [${reqId}] Receipt OCR started`);
      }
      ocrResult = await runReceiptOCR(documentDetected.croppedBuffer, {
        timeout: 30000,
      });
      const ocrDuration = Date.now() - ocrStart;
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ScanReceipt] [${reqId}] Receipt OCR completed`, {
          duration: `${ocrDuration}ms`,
          confidence: ocrResult.confidence,
          selectedPSM: ocrResult.selectedPSM,
          textLength: ocrResult.text.length,
        });
      }
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      throw createError(
        `Receipt OCR failed: ${error.message}`,
        500,
        'RECEIPT_OCR_ERROR'
      );
    }
    
    // Step 3: Normalize OCR lines
    const normalizeStart = Date.now();
    const lines = ocrResult.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const normalizedLines = normalizeOcrLines(lines);
    const normalizeDuration = Date.now() - normalizeStart;
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[ScanReceipt] [${reqId}] Normalization completed`, {
        duration: `${normalizeDuration}ms`,
        linesProcessed: normalizedLines.length,
      });
    }
    
    // Step 4: Reconstruct lines and extract totals
    const reconstructStart = Date.now();
    const items: CanonicalReceiptItem[] = [];
    let merchant: string | undefined;
    let date: string | undefined;
    let subtotal: number | undefined;
    let tax: number | undefined;
    let total: number | undefined;
    
    // Patterns for totals
    const totalPattern = /\b(total|amount\s*due|balance|grand\s*total)\b/i;
    const subtotalPattern = /sub\s*-?\s*total|subtotal/i;
    const taxPattern = /\b(tax|vat|gst|hst)\b/i;
    const pricePattern = /\$?\s*(\d+[.,]\d{2})\s*$/;
    const datePattern = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{2,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/;
    
    // First few lines often contain merchant name
    for (let i = 0; i < Math.min(3, normalizedLines.length); i++) {
      const line = normalizedLines[i].normalized;
      if (!pricePattern.test(line) && line.length > 3 && line.length < 50) {
        if (!merchant) {
          merchant = line;
          break;
        }
      }
    }
    
    // Parse lines
    for (let i = 0; i < normalizedLines.length; i++) {
      const normalized = normalizedLines[i];
      const line = normalized.normalized;
      
      // Check for date
      const dateMatch = line.match(datePattern);
      if (dateMatch && !date) {
        date = dateMatch[0];
        continue;
      }
      
      // Check for totals
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
      
      if (totalPattern.test(line)) {
        const match = line.match(pricePattern);
        if (match) {
          total = parseFloat(match[1].replace(',', '.'));
        }
        continue;
      }
      
      // Reconstruct line
      const reconstructed = reconstructReceiptLine(line, normalized.original);
      if (reconstructed) {
        items.push({
          item_id: generateId(),
          receipt_id: receiptId,
          quantity: reconstructed.quantity,
          item_name: reconstructed.itemName, // FULL name, not truncated
          unit_price: reconstructed.unitPrice,
          line_total: reconstructed.lineTotal,
          confidence_score: reconstructed.confidence,
          needs_review: reconstructed.needsReview,
          review_reasons: reconstructed.reviewReasons,
          original_ocr_line: normalized.original,
        });
      }
    }
    
    const reconstructDuration = Date.now() - reconstructStart;
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[ScanReceipt] [${reqId}] Reconstruction completed`, {
        duration: `${reconstructDuration}ms`,
        itemsFound: items.length,
      });
    }
    
    // Step 5: Apply receipt-level sanity checks
    const sanityStart = Date.now();
    const context = {
      items: items.map(i => ({
        quantity: i.quantity,
        itemName: i.item_name,
        unitPrice: i.unit_price,
        lineTotal: i.line_total,
      })),
      receiptTotal: total,
      subtotal,
    };
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sanityResult = checkReceiptItemSanity(
        {
          quantity: item.quantity,
          itemName: item.item_name,
          unitPrice: item.unit_price,
          lineTotal: item.line_total,
          originalLine: item.original_ocr_line,
        },
        context
      );
      
      // Update confidence and needs_review
      item.confidence_score = Math.min(item.confidence_score, sanityResult.confidence);
      item.needs_review = sanityResult.needsReview || item.needs_review;
      item.review_reasons = [...item.review_reasons, ...sanityResult.reviewReasons];
      
      // Note: We don't auto-apply suggested corrections - user must review
      // But we log them for debugging
      if (sanityResult.suggestedCorrections && process.env.LOG_LEVEL === 'debug') {
        console.log(`[ScanReceipt] [${reqId}] Suggested corrections for item ${i}:`, sanityResult.suggestedCorrections);
      }
    }
    
    const sanityDuration = Date.now() - sanityStart;
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[ScanReceipt] [${reqId}] Sanity checks completed`, {
        duration: `${sanityDuration}ms`,
        itemsNeedingReview: items.filter(i => i.needs_review).length,
      });
    }
    
    // Calculate overall confidence
    const avgItemConfidence = items.length > 0
      ? items.reduce((sum, item) => sum + item.confidence_score, 0) / items.length
      : 0;
    
    const hasTotal = total !== undefined;
    const itemsSum = items.reduce((sum, item) => sum + item.line_total, 0);
    const totalMatches = hasTotal && Math.abs(itemsSum - (total || 0)) < 2; // $2 tolerance
    
    const overallConfidence = Math.min(1, (
      avgItemConfidence * 0.5 +
      (items.length > 0 ? 0.2 : 0) +
      (hasTotal ? 0.15 : 0) +
      (totalMatches ? 0.15 : 0)
    ));
    
    const totalDuration = Date.now() - startTime;
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[ScanReceipt] [${reqId}] Scan completed`, {
        totalDuration: `${totalDuration}ms`,
        itemCount: items.length,
        overallConfidence: overallConfidence.toFixed(2),
      });
    }
    
    return {
      success: items.length > 0,
      receipt: {
        id: generateId(),
        items: items.map(item => ({
          id: item.item_id,
          name: item.item_name, // FULL name preserved
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice: item.line_total,
          confidence: item.confidence_score,
          needsReview: item.needs_review,
          reviewReasons: item.review_reasons,
          rawText: item.original_ocr_line,
        })),
        confidence: overallConfidence,
        needsReview: items.some(item => item.needs_review) || items.length === 0,
      },
      merchant,
      date,
      subtotal,
      tax,
      total,
      documentDetected: documentDetected.documentDetected,
      detectionStrategy: documentDetected.strategy,
      message: items.length === 0 
        ? 'No items detected. Please review manually.' 
        : undefined,
    };
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.error(`[ScanReceipt] [${reqId}] Scan failed`, {
        error: error.message,
        code: error.code,
        totalDuration: `${totalDuration}ms`,
      });
    }
    
    if (error.statusCode) {
      throw error;
    }
    
    throw createError(
      `Receipt scan failed: ${error.message}`,
      500,
      'RECEIPT_SCAN_ERROR',
      { originalError: error.message }
    );
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
