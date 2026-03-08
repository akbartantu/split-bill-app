/**
 * Receipt Routes
 * 
 * Handles receipt upload and OCR endpoints.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { uploadReceiptImage, validateUploadedFile } from '../middleware/uploadMiddleware.js';
import { processReceiptUpload } from '../receipt/service/receiptService.js';
import { createError } from '../middleware/errorHandler.js';
import { GoogleSheetsClient } from '../clients/GoogleSheetsClient.js';
import { recordReceiptUse } from '../analytics/analyticsService.js';

const router = Router();

/**
 * Shared upload/scan handler (used by both POST /upload and POST /scan)
 */
async function handleReceiptUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requestId = req.headers['x-request-id'] as string || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const startTime = Date.now();
  
  // Log request start (dev only)
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[Receipt Upload] [${requestId}] Request received`, {
      timestamp: new Date().toISOString(),
      hasFile: !!req.file,
    });
  }
  
  try {
    // Validate file exists
    validateUploadedFile(req);
    
    const file = req.file!;
    const billingId = req.body.billing_id || req.query.billing_id;
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Receipt Upload] [${requestId}] File validated`, {
        size: file.size,
        mimetype: file.mimetype,
      });
    }
    
    // Initialize sheets client if credentials available (optional - don't fail if not available)
    let sheetsClient: GoogleSheetsClient | undefined;
    try {
      const spreadsheetId = process.env.SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID;
      const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
      
      // Support key file
      let finalEmail = serviceAccountEmail;
      let finalKey = privateKey;
      
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
        const fs = await import('fs');
        const path = await import('path');
        const keyFilePath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
        const keyData = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
        finalEmail = keyData.client_email;
        finalKey = keyData.private_key;
      }
      
      if (spreadsheetId && finalEmail && finalKey && 
          spreadsheetId !== 'replace_me' && 
          spreadsheetId.trim() !== '' &&
          finalEmail !== 'replace_me' && 
          finalEmail.trim() !== '' &&
          finalKey !== 'replace_me' && 
          finalKey.trim() !== '') {
        sheetsClient = new GoogleSheetsClient(spreadsheetId, finalEmail, finalKey);
      }
    } catch (error: any) {
      // Sheets client not available - continue without it (not critical)
      if (process.env.LOG_LEVEL === 'debug') {
        console.warn(`[Receipt Upload] [${requestId}] Sheets client not available:`, error.message);
      }
    }
    
    // Process receipt with timeout guard (configurable, default 120 seconds)
    const MAX_PROCESSING_TIME =
      Number(process.env.RECEIPT_MAX_PROCESSING_MS) || 120_000;
    const processingPromise = processReceiptUpload(
      file.buffer,
      file.mimetype,
      billingId as string,
      sheetsClient,
      requestId
    );
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          createError(
            'Scan took too long. Try again later or with a smaller/clearer image.',
            504,
            'SCAN_TIMEOUT'
          )
        );
      }, MAX_PROCESSING_TIME);
    });
    
    const result = await Promise.race([processingPromise, timeoutPromise]);
    
    const duration = Date.now() - startTime;
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[Receipt Upload] [${requestId}] Processing completed`, {
        duration: `${duration}ms`,
        itemCount: result.receipt.items.length,
        success: result.success,
      });
    }

    // Track receipt use for analytics (fire-and-forget)
    recordReceiptUse(req).then(
      () => {},
      () => {}
    );

    res.json({
      ok: true,
      data: result,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.error(`[Receipt Upload] [${requestId}] Error`, {
        error: error.message,
        code: error.code,
        duration: `${duration}ms`,
      });
    }
    
    // Error handler middleware will format the response
    next(error);
  }
}

/**
 * POST /api/receipts/upload
 *
 * Upload receipt image for OCR processing.
 * Field name: "receipt_image"
 */
router.post('/upload', uploadReceiptImage, handleReceiptUpload);

/**
 * POST /api/receipts/scan
 *
 * Alias for /upload (backward compatibility)
 */
router.post('/scan', uploadReceiptImage, handleReceiptUpload);

export { router as receiptRoutes };
