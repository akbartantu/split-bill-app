/**
 * Multi-Pass OCR Engine
 * 
 * Runs OCR with multiple preprocessing variants and PSM modes
 * to handle different receipt layouts.
 */

import Tesseract from 'tesseract.js';
import type { PreprocessingVariant } from './preprocessing';

export interface OCRResult {
  text: string;
  confidence: number;
  psm: number;
  variant: string;
  rawData?: any;
}

/**
 * PSM modes to try (in order of preference)
 * Note: Tesseract.js v7 uses recognize() API which doesn't directly support PSM config
 * We'll try different preprocessing variants instead, which is often more effective
 * For now, we'll use the default PSM and rely on preprocessing variants
 */
const PSM_MODES = [11, 6, 12, 13] as const; // Keep for metadata, but use default PSM

/**
 * Perform multi-pass OCR on preprocessed variants
 * 
 * Strategy: Try each preprocessing variant with default PSM
 * The different preprocessing strategies often work better than PSM changes
 */
export async function performMultiPassOCR(
  variants: PreprocessingVariant[],
  onProgress?: (progress: number) => void
): Promise<OCRResult[]> {
  const results: OCRResult[] = [];
  
  // Limit to first 2 variants to prevent memory issues
  const limitedVariants = variants.slice(0, 2);
  const totalPasses = limitedVariants.length;
  let completedPasses = 0;

  // Try each preprocessing variant sequentially (not parallel to avoid memory spikes)
  for (const variant of limitedVariants) {
    try {
      // Add per-variant timeout
      const ocrPromise = Tesseract.recognize(variant.imageData, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            const passProgress = m.progress || 0;
            const overallProgress = (completedPasses + passProgress) / totalPasses;
            onProgress(overallProgress);
          }
        },
      });
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('OCR variant timeout')), 60000); // 60s per variant
      });
      
      const result = await Promise.race([ocrPromise, timeoutPromise]);

      // Extract confidence from result
      const confidence = result.data.confidence || 0;
      
      // Only add if we got meaningful text
      if (result.data.text && result.data.text.trim().length > 10) {
        results.push({
          text: result.data.text,
          confidence: confidence / 100, // Normalize to 0-1
          psm: 11, // Default PSM (SPARSE_TEXT) - metadata only
          variant: variant.name,
          rawData: result.data,
        });
        
        // If we got high confidence, we can stop early
        if (confidence > 80) {
          console.log(`[OCR] High confidence (${confidence}%) - stopping early`);
          break;
        }
      }
    } catch (error: any) {
      console.warn(`[OCR] Variant ${variant.name} failed:`, error.message);
      // Continue with other variants - don't fail completely
    }
    
    completedPasses++;
    onProgress?.(completedPasses / totalPasses);
  }

  // If all variants failed, return at least one empty result
  if (results.length === 0) {
    console.warn('[OCR] All variants failed - returning empty result');
    results.push({
      text: '',
      confidence: 0,
      psm: 11,
      variant: 'failed',
    });
  }

  return results;
}

/**
 * Perform OCR with default settings (for testing)
 */
export async function performOCRWithPSM(
  imageSource: string | File,
  psm: number,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  const result = await Tesseract.recognize(imageSource, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress || 0);
      }
    },
  });

  return {
    text: result.data.text,
    confidence: (result.data.confidence || 0) / 100,
    psm,
    variant: 'single',
    rawData: result.data,
  };
}
