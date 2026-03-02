/**
 * Main OCR Entry Point
 * 
 * Integrates preprocessing, multi-pass OCR, scoring, and parsing
 * to provide reliable receipt scanning.
 */

import { preprocessReceiptImage } from './preprocessing';
import { performMultiPassOCR } from './engine';
import { scoreOCRResults, selectBestOCRResult, isLowConfidence } from './scoring';
import { parseReceiptText, type ParsedReceipt } from './parser';

export interface ScanReceiptResult {
  success: boolean;
  receipt: ParsedReceipt;
  needsManualEntry: boolean;
  rawOCRText?: string;
  documentDetected?: boolean;
  detectionStrategy?: string;
  debugInfo?: {
    variants: any[];
    ocrResults: any[];
    scores: any[];
  };
}

/**
 * Full receipt scanning pipeline
 */
export async function scanReceipt(
  imageSource: File,
  onProgress?: (stage: string, progress: number) => void
): Promise<ScanReceiptResult> {
  try {
    // Validate input
    if (!imageSource || !(imageSource instanceof File)) {
      throw new Error('Invalid file: must be a File object');
    }
    
    if (imageSource.size === 0) {
      throw new Error('File is empty');
    }
    
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (imageSource.size > MAX_SIZE) {
      throw new Error(`File too large: ${imageSource.size} bytes (max: ${MAX_SIZE} bytes)`);
    }
    
    // Step 1: Preprocessing
    onProgress?.('preprocessing', 0);
    
    let variants: any[];
    try {
      // Add timeout for preprocessing
      const preprocessingPromise = preprocessReceiptImage(imageSource);
      const preprocessingTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Preprocessing timeout')), 30000); // 30 seconds
      });
      
      variants = await Promise.race([preprocessingPromise, preprocessingTimeout]);
      onProgress?.('preprocessing', 100);
      
      if (!variants || variants.length === 0) {
        throw new Error('Preprocessing failed - no variants created');
      }
    } catch (error: any) {
      throw new Error(`Preprocessing failed: ${error.message}`);
    }
    
    // Step 2: Multi-pass OCR
    onProgress?.('scanning', 0);
    
    let ocrResults: any[];
    try {
      // Add timeout for OCR
      const ocrPromise = performMultiPassOCR(variants, (progress) => {
        onProgress?.('scanning', progress * 100);
      });
      const ocrTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('OCR timeout')), 60000); // 60 seconds
      });
      
      ocrResults = await Promise.race([ocrPromise, ocrTimeout]);
      onProgress?.('scanning', 100);
    } catch (error: any) {
      // If OCR fails completely, return empty result instead of crashing
      console.warn('[OCR] OCR failed, returning empty result:', error.message);
      ocrResults = [];
    }
    
    if (ocrResults.length === 0) {
      // All OCR passes failed
      return {
        success: false,
        receipt: {
          items: [],
          confidence: 0,
          rawText: '',
        },
        needsManualEntry: true,
        rawOCRText: '',
      };
    }
    
    // Step 3: Scoring and selection
    onProgress?.('parsing', 0);
    const scoredResults = scoreOCRResults(ocrResults);
    const bestResult = selectBestOCRResult(scoredResults);
    
    if (!bestResult) {
      return {
        success: false,
        receipt: {
          items: [],
          confidence: 0,
          rawText: ocrResults[0]?.text || '',
        },
        needsManualEntry: true,
        rawOCRText: ocrResults[0]?.text || '',
      };
    }
    
    // Step 4: Parse receipt
    onProgress?.('parsing', 0);
    let parsedReceipt: ParsedReceipt;
    
    try {
      if (!bestResult.result.text || bestResult.result.text.trim().length === 0) {
        throw new Error('OCR returned empty text');
      }
      
      parsedReceipt = parseReceiptText(bestResult.result.text, bestResult.result);
      
      // Update metadata with score
      if (parsedReceipt.ocrMetadata) {
        parsedReceipt.ocrMetadata.score = bestResult.score;
      }
      
      onProgress?.('parsing', 100);
    } catch (error: any) {
      console.warn('[OCR] Parsing failed:', error.message);
      // Return partial result with raw text instead of crashing
      parsedReceipt = {
        items: [],
        confidence: bestResult.result.confidence || 0,
        rawText: bestResult.result.text || '',
      };
      onProgress?.('parsing', 100);
    }
    
    // Check if we need manual entry
    const needsManualEntry = isLowConfidence(bestResult) || parsedReceipt.items.length === 0;
    
    return {
      success: parsedReceipt.items.length > 0,
      receipt: parsedReceipt,
      needsManualEntry,
      rawOCRText: bestResult.result.text,
      debugInfo: {
        variants: variants.map(v => ({ name: v.name, strategy: v.metadata.strategy })),
        ocrResults: ocrResults.map(r => ({ psm: r.psm, variant: r.variant, confidence: r.confidence })),
        scores: scoredResults.map(s => ({ score: s.score, itemLineCount: s.itemLineCount, reasons: s.reasons })),
      },
    };
  } catch (error: any) {
    console.error('[OCR] Scanning failed:', error);
    
    // Return structured error response instead of crashing
    return {
      success: false,
      receipt: {
        items: [],
        confidence: 0,
        rawText: '',
      },
      needsManualEntry: true,
      rawOCRText: error.message || 'OCR processing failed',
    };
  }
}

// Re-export types for convenience
export type { ParsedReceipt, ParsedItem } from './parser';
