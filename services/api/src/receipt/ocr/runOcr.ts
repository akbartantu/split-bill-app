/**
 * OCR Execution Module (Server-Side)
 * 
 * Runs OCR on preprocessed images with timeout and error handling.
 * Currently supports Tesseract.js (can be extended to Google Vision).
 */

import { createError } from '../../middleware/errorHandler';

export interface OCRResult {
  text: string;
  confidence: number;
  rawData?: any;
}

export interface OCROptions {
  timeout?: number; // milliseconds
  provider?: 'tesseract' | 'google-vision';
}

const DEFAULT_TIMEOUT = 60000; // 60 seconds

/**
 * Run OCR with timeout and error handling
 */
export async function runOCR(
  imageBuffer: Buffer,
  options: OCROptions = {}
): Promise<OCRResult> {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const provider = options.provider || process.env.OCR_PROVIDER || 'tesseract';
  
  try {
    if (provider === 'tesseract') {
      return await runTesseractOCR(imageBuffer, timeout);
    } else if (provider === 'google-vision') {
      return await runGoogleVisionOCR(imageBuffer, timeout);
    } else {
      throw createError(
        `Unsupported OCR provider: ${provider}`,
        400,
        'UNSUPPORTED_OCR_PROVIDER'
      );
    }
  } catch (error: any) {
    // Re-throw API errors
    if (error.statusCode) {
      throw error;
    }
    
    // Wrap other errors
    throw createError(
      `OCR failed: ${error.message}`,
      500,
      'OCR_ERROR',
      { originalError: error.message }
    );
  }
}

/**
 * Run Tesseract OCR with timeout
 */
async function runTesseractOCR(
  imageBuffer: Buffer,
  timeout: number
): Promise<OCRResult> {
  return new Promise(async (resolve, reject) => {
    // Set timeout
    const timeoutId = setTimeout(() => {
      reject(createError(
        'OCR timeout - processing took too long (exceeded 30 seconds)',
        408,
        'OCR_TIMEOUT'
      ));
    }, timeout);
    
    try {
      // Validate buffer
      if (!imageBuffer || imageBuffer.length === 0) {
        clearTimeout(timeoutId);
        reject(createError('Image buffer is empty', 400, 'EMPTY_BUFFER'));
        return;
      }
      
      // Import Tesseract dynamically
      const Tesseract = await import('tesseract.js');
      
      // Convert buffer to data URL or use Tesseract's buffer support
      const base64 = imageBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      
      // Run OCR with error handling
      const result = await Tesseract.default.recognize(dataUrl, 'eng', {
        logger: (m: any) => {
          // Log progress if debug mode
          if (process.env.LOG_LEVEL === 'debug') {
            console.log('[OCR Progress]', m.status, m.progress);
          }
        },
      });
      
      clearTimeout(timeoutId);
      
      // Validate result
      if (!result || !result.data) {
        reject(createError('OCR returned invalid result', 500, 'OCR_INVALID_RESULT'));
        return;
      }
      
      resolve({
        text: result.data.text || '',
        confidence: (result.data.confidence || 0) / 100, // Normalize to 0-1
        rawData: result.data,
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Re-throw API errors
      if (error.statusCode) {
        reject(error);
        return;
      }
      
      // Wrap other errors
      reject(createError(
        `OCR execution failed: ${error.message}`,
        500,
        'OCR_EXECUTION_ERROR'
      ));
    }
  });
}

/**
 * Run Google Vision OCR (if configured)
 */
async function runGoogleVisionOCR(
  imageBuffer: Buffer,
  timeout: number
): Promise<OCRResult> {
  // TODO: Implement Google Vision OCR
  throw createError(
    'Google Vision OCR not yet implemented',
    501,
    'NOT_IMPLEMENTED'
  );
}
