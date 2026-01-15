/**
 * Receipt Service
 * 
 * Business logic for receipt operations.
 * Handles OCR, parsing, and saving to spreadsheet.
 */

import { GoogleSheetsClient } from '../../../../../packages/infra-sheets/src/clients/GoogleSheetsClient';
import { detectAndCropDocument } from '../preprocess/documentDetectAndCrop';
import { preprocessImage } from '../preprocess/preprocessImage';
import { runOCR } from '../ocr/runOcr';
import { parseReceipt } from '../parse/parseReceipt';
import { scanReceipt } from './scanReceiptService';
import { createError } from '../../middleware/errorHandler';

export interface ReceiptUploadResult {
  success: boolean;
  receipt: {
    id: string;
    items: any[];
    confidence: number;
    needsReview: boolean;
  };
  message?: string;
  documentDetected?: boolean;
  detectionStrategy?: string;
}

/**
 * Process receipt upload using receipt-aware pipeline
 * 
 * Uses new scanReceipt service for thermal receipt optimization.
 * Falls back to old pipeline if needed.
 */
export async function processReceiptUpload(
  imageBuffer: Buffer,
  mimetype: string,
  billingId?: string,
  sheetsClient?: GoogleSheetsClient,
  requestId?: string
): Promise<ReceiptUploadResult> {
  // Use new receipt-aware pipeline
  try {
    const scanResult = await scanReceipt(
      imageBuffer,
      mimetype,
      billingId,
      sheetsClient,
      requestId
    );
    
    return {
      success: scanResult.success,
      receipt: {
        id: scanResult.receipt.id,
        items: scanResult.receipt.items,
        confidence: scanResult.receipt.confidence,
        needsReview: scanResult.receipt.needsReview,
      },
      message: scanResult.message,
      documentDetected: scanResult.documentDetected,
      detectionStrategy: scanResult.detectionStrategy,
    };
  } catch (error: any) {
    // If new pipeline fails, log and fall back to old pipeline
    if (process.env.LOG_LEVEL === 'debug') {
      console.warn(`[ReceiptService] New pipeline failed, falling back to old:`, error.message);
    }
    
    // Fall through to old pipeline below
  }
  
  // OLD PIPELINE (fallback)
  return processReceiptUploadLegacy(
    imageBuffer,
    mimetype,
    billingId,
    sheetsClient,
    requestId
  );
}

/**
 * Legacy receipt processing (fallback)
 */
async function processReceiptUploadLegacy(
  imageBuffer: Buffer,
  mimetype: string,
  billingId?: string,
  sheetsClient?: GoogleSheetsClient,
  requestId?: string
): Promise<ReceiptUploadResult> {
  const reqId = requestId || `req_${Date.now()}`;
  const startTime = Date.now();
  
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[ReceiptService] [${reqId}] Starting processing`, {
      bufferSize: imageBuffer.length,
      mimetype,
    });
  }
  let documentDetected: any;
  let preprocessed: any;
  let ocrResult: any;
  let parsed: any;
  
  try {
    // Step 1: Detect and crop document (NEW)
    const detectStart = Date.now();
    try {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ReceiptService] [${reqId}] Document detection started`);
      }
      documentDetected = await detectAndCropDocument(imageBuffer, mimetype, reqId);
      const detectDuration = Date.now() - detectStart;
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ReceiptService] [${reqId}] Document detection completed`, {
          duration: `${detectDuration}ms`,
          detected: documentDetected.documentDetected,
          strategy: documentDetected.strategy,
          confidence: documentDetected.confidence,
        });
      }
    } catch (error: any) {
      // Document detection failure is not critical - continue with original image
      if (process.env.LOG_LEVEL === 'debug') {
        console.warn(`[ReceiptService] [${reqId}] Document detection failed, using original image:`, error.message);
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
    
    // Step 2: Preprocess cropped image
    const preprocessStart = Date.now();
    try {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ReceiptService] [${reqId}] Preprocessing started`);
      }
      preprocessed = await preprocessImage(documentDetected.croppedBuffer, mimetype);
      const preprocessDuration = Date.now() - preprocessStart;
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ReceiptService] [${reqId}] Preprocessing completed`, {
          duration: `${preprocessDuration}ms`,
          size: preprocessed.size,
        });
      }
    } catch (error: any) {
      throw createError(
        `Image preprocessing failed: ${error.message}`,
        400,
        'PREPROCESSING_ERROR'
      );
    }
    
    // Step 3: Run OCR
    const ocrStart = Date.now();
    try {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ReceiptService] [${reqId}] OCR started`);
      }
      ocrResult = await runOCR(preprocessed.buffer, {
        timeout: 30000, // 30 seconds
      });
      const ocrDuration = Date.now() - ocrStart;
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ReceiptService] [${reqId}] OCR completed`, {
          duration: `${ocrDuration}ms`,
          confidence: ocrResult.confidence,
          textLength: ocrResult.text.length,
        });
      }
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      throw createError(
        `OCR failed: ${error.message}`,
        500,
        'OCR_ERROR'
      );
    }
    
    // Step 4: Parse receipt
    const parseStart = Date.now();
    try {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ReceiptService] [${reqId}] Parsing started`);
      }
      parsed = parseReceipt(ocrResult.text, ocrResult.confidence);
      const parseDuration = Date.now() - parseStart;
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ReceiptService] [${reqId}] Parsing completed`, {
          duration: `${parseDuration}ms`,
          itemCount: parsed.items.length,
        });
      }
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      // If parsing fails, return partial result with raw text
      if (process.env.LOG_LEVEL === 'debug') {
        console.warn(`[ReceiptService] [${reqId}] Parsing failed, returning partial result`);
      }
      parsed = {
        items: [],
        confidence: ocrResult.confidence,
        rawText: ocrResult.text,
      };
    }
    
    // Step 4: Save to spreadsheet (if client provided and billingId exists)
    if (sheetsClient && billingId) {
      try {
        await saveReceiptToSheets(sheetsClient, billingId, parsed);
      } catch (error: any) {
        // Don't fail the whole request if sheets save fails
        console.error('[ReceiptService] Failed to save to sheets:', error.message);
        // Continue - receipt processing succeeded even if save failed
      }
    }
    
    const totalDuration = Date.now() - startTime;
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[ReceiptService] [${reqId}] Processing completed successfully`, {
        totalDuration: `${totalDuration}ms`,
        itemCount: parsed.items.length,
      });
    }
    
    return {
      success: parsed.items.length > 0,
      receipt: {
        id: generateId(),
        items: parsed.items,
        confidence: parsed.confidence,
        needsReview: parsed.items.some((item: any) => item.needsReview) || parsed.items.length === 0,
      },
      message: parsed.items.length === 0 
        ? 'No items detected. Please review manually.' 
        : undefined,
      documentDetected: documentDetected.documentDetected,
      detectionStrategy: documentDetected.strategy,
    };
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.error(`[ReceiptService] [${reqId}] Processing failed`, {
        error: error.message,
        code: error.code,
        totalDuration: `${totalDuration}ms`,
      });
    }
    
    // Re-throw API errors
    if (error.statusCode) {
      throw error;
    }
    
    // Wrap unexpected errors
    throw createError(
      `Receipt processing failed: ${error.message}`,
      500,
      'RECEIPT_PROCESSING_ERROR',
      { originalError: error.message }
    );
  }
}

/**
 * Save receipt to spreadsheet
 */
async function saveReceiptToSheets(
  client: GoogleSheetsClient,
  billingId: string,
  parsed: any
): Promise<void> {
  try {
    // Validate spreadsheet ID exists
    const spreadsheetId = process.env.SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId || spreadsheetId === 'replace_me' || spreadsheetId.trim() === '') {
      throw createError(
        'Spreadsheet not configured. Set SPREADSHEET_ID in .env',
        500,
        'SPREADSHEET_NOT_CONFIGURED'
      );
    }
    
    // Validate billing ID
    if (!billingId || billingId.trim() === '') {
      throw createError('Billing ID is required', 400, 'MISSING_BILLING_ID');
    }
    
    // TODO: Implement actual save to sheets
    // For now, just validate and log
    if (process.env.LOG_LEVEL === 'debug') {
      console.log('[ReceiptService] Would save receipt to spreadsheet:', {
        billingId,
        itemCount: parsed.items.length,
      });
    }
    
    // Future implementation:
    // 1. Create receipt row in receipts sheet
    // 2. Create line_item rows in line_items sheet
    // 3. Link them with foreign keys
    
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }
    throw createError(
      `Failed to save receipt to spreadsheet: ${error.message}`,
      502,
      'SPREADSHEET_ERROR'
    );
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
