/**
 * File Upload Middleware
 * 
 * Handles receipt image uploads with validation and size limits.
 * Field name: "receipt_image"
 */

import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { createError } from './errorHandler';

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/**
 * File filter: only allow images
 */
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  try {
    if (!file) {
      cb(createError('No file provided', 400, 'MISSING_FILE') as any);
      return;
    }
    
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      cb(createError(
        `File must be an image. Received: ${file.mimetype || 'unknown'}`,
        400,
        'INVALID_FILE_TYPE'
      ) as any);
      return;
    }
    
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(createError(
        `File type not supported: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
        400,
        'INVALID_FILE_TYPE'
      ) as any);
      return;
    }
    
    cb(null, true);
  } catch (error: any) {
    cb(createError(
      `File validation failed: ${error.message}`,
      400,
      'FILE_VALIDATION_ERROR'
    ) as any);
  }
};

/**
 * Multer configuration with memory storage
 */
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only one file
  },
  fileFilter,
});

/**
 * Upload middleware for receipt images
 * Field name: "receipt_image"
 */
export const uploadReceiptImage = upload.single('receipt_image');

/**
 * Validate uploaded file exists
 */
export function validateUploadedFile(req: Request): void {
  if (!req.file) {
    throw createError(
      'No file uploaded. Field name must be "receipt_image"',
      400,
      'MISSING_FILE'
    );
  }
  
  // Additional validation
  if (req.file.size === 0) {
    throw createError('Uploaded file is empty', 400, 'EMPTY_FILE');
  }
  
  if (req.file.size > MAX_FILE_SIZE) {
    throw createError(
      `File size (${(req.file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum (${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)}MB)`,
      400,
      'FILE_TOO_LARGE'
    );
  }
  
  // Validate buffer exists
  if (!req.file.buffer || req.file.buffer.length === 0) {
    throw createError('File buffer is empty', 400, 'EMPTY_BUFFER');
  }
  
  // Validate mimetype
  if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
    throw createError(
      `Invalid file type: ${req.file.mimetype || 'unknown'}`,
      400,
      'INVALID_FILE_TYPE'
    );
  }
}
