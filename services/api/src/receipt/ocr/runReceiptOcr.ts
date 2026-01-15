/**
 * Receipt-Aware OCR Execution
 * 
 * OCR optimized for thermal restaurant receipts with column alignment.
 * Uses PSM modes best suited for column-based text.
 */

import { createError } from '../../middleware/errorHandler';

export interface ReceiptOCRResult {
  text: string;
  confidence: number;
  selectedPSM: number;
  rawData?: any;
}

export interface ReceiptOCROptions {
  timeout?: number; // milliseconds
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * PSM modes optimized for receipts:
 * - 6 = Uniform block of text (best for columns)
 * - 11 = Sparse text (fallback)
 */
const RECEIPT_PSM_MODES = [6, 11];

/**
 * OCR whitelist for receipts: A-Z, a-z, 0-9, ., $, x, &
 */
const RECEIPT_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789. $x&';

/**
 * Run OCR optimized for thermal receipts
 * 
 * Strategy:
 * 1. Try PSM 6 (uniform block - best for columns)
 * 2. If confidence low, try PSM 11 (sparse text)
 * 3. Return best result
 */
export async function runReceiptOCR(
  imageBuffer: Buffer,
  options: ReceiptOCROptions = {}
): Promise<ReceiptOCRResult> {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('[ReceiptOCR] Starting column-aware OCR');
  }
  
  try {
    // Validate buffer
    if (!imageBuffer || imageBuffer.length === 0) {
      throw createError('Image buffer is empty', 400, 'EMPTY_BUFFER');
    }
    
    // Import Tesseract dynamically
    const Tesseract = await import('tesseract.js');
    
    // Convert buffer to data URL
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    
    // Try PSM modes sequentially
    let bestResult: ReceiptOCRResult | null = null;
    let bestConfidence = 0;
    
    for (const psm of RECEIPT_PSM_MODES) {
      try {
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[ReceiptOCR] Trying PSM ${psm}`);
        }
        
        const result = await Promise.race([
          Tesseract.default.recognize(dataUrl, 'eng', {
            logger: (m: any) => {
              if (process.env.LOG_LEVEL === 'debug') {
                console.log(`[OCR PSM ${psm}]`, m.status, m.progress);
              }
            },
            // PSM mode
            tessedit_pageseg_mode: psm,
            // Whitelist characters
            tessedit_char_whitelist: RECEIPT_WHITELIST,
          }),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(createError('OCR timeout', 408, 'OCR_TIMEOUT'));
            }, timeout);
          }),
        ]);
        
        if (result && result.data) {
          const confidence = (result.data.confidence || 0) / 100;
          const text = result.data.text || '';
          
          if (process.env.LOG_LEVEL === 'debug') {
            console.log(`[ReceiptOCR] PSM ${psm} result`, {
              confidence: confidence.toFixed(2),
              textLength: text.length,
            });
          }
          
          // Keep best result
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestResult = {
              text,
              confidence,
              selectedPSM: psm,
              rawData: result.data,
            };
          }
          
          // Early exit if confidence is high
          if (confidence > 0.8) {
            if (process.env.LOG_LEVEL === 'debug') {
              console.log(`[ReceiptOCR] High confidence (${confidence.toFixed(2)}), using PSM ${psm}`);
            }
            break;
          }
        }
      } catch (error: any) {
        if (error.statusCode === 408) {
          throw error; // Timeout - rethrow
        }
        // PSM mode failed - try next
        if (process.env.LOG_LEVEL === 'debug') {
          console.warn(`[ReceiptOCR] PSM ${psm} failed:`, error.message);
        }
        continue;
      }
    }
    
    if (!bestResult) {
      throw createError('All OCR attempts failed', 500, 'OCR_ALL_FAILED');
    }
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.log('[ReceiptOCR] Completed', {
        selectedPSM: bestResult.selectedPSM,
        confidence: bestResult.confidence.toFixed(2),
        textLength: bestResult.text.length,
      });
    }
    
    return bestResult;
  } catch (error: any) {
    // Re-throw API errors
    if (error.statusCode) {
      throw error;
    }
    
    // Wrap other errors
    throw createError(
      `Receipt OCR failed: ${error.message}`,
      500,
      'RECEIPT_OCR_ERROR',
      { originalError: error.message }
    );
  }
}
