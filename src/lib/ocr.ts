/**
 * OCR Module - Main Entry Point
 * 
 * This file provides backward-compatible exports while using
 * the new modular OCR implementation.
 */

import { scanReceipt as newScanReceipt, type ScanReceiptResult } from './ocr/index';
import type { ParsedReceipt, ParsedItem } from './ocr/parser';

// Re-export types for backward compatibility
export type { ParsedReceipt, ParsedItem } from './ocr/parser';
export type { ScanReceiptResult } from './ocr/index';

/**
 * Main scanReceipt function - now uses improved multi-pass OCR
 * Maintains backward compatibility with existing code
 */
export async function scanReceipt(
  imageSource: File,
  onProgress?: (stage: string, progress: number) => void
): Promise<ParsedReceipt> {
  const result = await newScanReceipt(imageSource, onProgress);
  return result.receipt;
}

/**
 * New scanReceipt function that returns full result including metadata
 */
export async function scanReceiptFull(
  imageSource: File,
  onProgress?: (stage: string, progress: number) => void
): Promise<ScanReceiptResult> {
  return newScanReceipt(imageSource, onProgress);
}
