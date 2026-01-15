/**
 * Image Preprocessing Module (Server-Side)
 * 
 * Preprocesses images before OCR to reduce failures and memory usage.
 * Uses sharp if available, otherwise falls back to basic validation.
 */

import { createError } from '../../middleware/errorHandler';

export interface PreprocessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  size: number;
}

/**
 * Maximum dimensions after preprocessing
 */
const MAX_WIDTH = 1500;
const MAX_HEIGHT = 2000;
const MAX_SIZE_AFTER_PROCESSING = 2 * 1024 * 1024; // 2MB

/**
 * Preprocess image for OCR
 * 
 * - Resizes if too large (no upscaling)
 * - Converts to JPEG/PNG
 * - Compresses to reduce memory
 */
export async function preprocessImage(
  buffer: Buffer,
  mimetype: string
): Promise<PreprocessedImage> {
  // Validate input
  if (!buffer || buffer.length === 0) {
    throw createError('Image buffer is empty', 400, 'EMPTY_BUFFER');
  }
  
  if (!mimetype || !mimetype.startsWith('image/')) {
    throw createError('Invalid image type', 400, 'INVALID_IMAGE_TYPE');
  }
  
  try {
    // Try to use sharp if available
    let sharp: any;
    try {
      sharp = (await import('sharp')).default;
    } catch {
      // Sharp not available, use basic validation
      console.warn('[Preprocess] Sharp not available, using basic validation');
      return preprocessImageBasic(buffer, mimetype);
    }

    // Use sharp for preprocessing
    let image = sharp(buffer);
    
    // Get metadata with error handling
    let metadata: any;
    try {
      metadata = await image.metadata();
    } catch (error: any) {
      throw createError(
        `Failed to read image metadata: ${error.message}`,
        400,
        'INVALID_IMAGE'
      );
    }
    
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;
    
    if (originalWidth === 0 || originalHeight === 0) {
      throw createError('Invalid image dimensions', 400, 'INVALID_IMAGE_DIMENSIONS');
    }
    
    // Calculate resize dimensions (no upscaling)
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    
    if (originalWidth > MAX_WIDTH || originalHeight > MAX_HEIGHT) {
      const scale = Math.min(
        MAX_WIDTH / originalWidth,
        MAX_HEIGHT / originalHeight
      );
      targetWidth = Math.floor(originalWidth * scale);
      targetHeight = Math.floor(originalHeight * scale);
    }
    
    // Resize if needed
    if (targetWidth !== originalWidth || targetHeight !== originalHeight) {
      image = image.resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    
    // Convert to JPEG for consistency and compression
    image = image.jpeg({ 
      quality: 85,
      mozjpeg: true,
    });
    
    // Get processed buffer with timeout
    const processedBuffer = await Promise.race([
      image.toBuffer(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Image processing timeout')), 10000); // 10 seconds
      }),
    ]);
    
    // Check final size
    if (processedBuffer.length > MAX_SIZE_AFTER_PROCESSING) {
      throw createError(
        `Processed image still too large (${processedBuffer.length} bytes). Please use a smaller image.`,
        400,
        'IMAGE_TOO_LARGE'
      );
    }
    
    return {
      buffer: processedBuffer,
      width: targetWidth,
      height: targetHeight,
      format: 'jpeg',
      size: processedBuffer.length,
    };
  } catch (error: any) {
    // If preprocessing fails, try basic validation
    if (error.statusCode) {
      throw error; // Re-throw API errors
    }
    
    // If it's a timeout or critical error, throw it
    if (error.message?.includes('timeout') || error.message?.includes('memory')) {
      throw createError(
        `Image preprocessing failed: ${error.message}`,
        400,
        'PREPROCESSING_ERROR'
      );
    }
    
    console.warn('[Preprocess] Sharp failed, using basic validation:', error.message);
    return preprocessImageBasic(buffer, mimetype);
  }
}

/**
 * Basic image preprocessing (fallback when sharp is not available)
 * Only validates, doesn't resize
 */
function preprocessImageBasic(
  buffer: Buffer,
  mimetype: string
): PreprocessedImage {
  // Basic validation
  if (buffer.length === 0) {
    throw createError('Image buffer is empty', 400, 'EMPTY_IMAGE');
  }
  
  if (buffer.length > MAX_SIZE_AFTER_PROCESSING) {
    throw createError(
      `Image too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum: ${(MAX_SIZE_AFTER_PROCESSING / 1024 / 1024).toFixed(1)}MB`,
      400,
      'IMAGE_TOO_LARGE'
    );
  }
  
  // Validate image format by checking magic bytes
  const isValidImage = 
    (mimetype === 'image/jpeg' && buffer[0] === 0xFF && buffer[1] === 0xD8) ||
    (mimetype === 'image/png' && buffer[0] === 0x89 && buffer[1] === 0x50) ||
    (mimetype === 'image/webp' && buffer[0] === 0x52 && buffer[1] === 0x49);
  
  if (!isValidImage) {
    throw createError('Invalid image format or corrupted file', 400, 'INVALID_IMAGE_FORMAT');
  }
  
  // Try to get dimensions from buffer (basic check)
  // This is a simplified check - in production, use sharp or image library
  let width = 0;
  let height = 0;
  
  // For JPEG, try to read basic header (simplified)
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
    // Basic JPEG header check
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      // Valid JPEG - dimensions would need proper parsing
      // For now, use placeholder (actual parsing would require full JPEG parser)
      width = 1000; // Placeholder
      height = 1000; // Placeholder
    }
  }
  
  return {
    buffer,
    width,
    height,
    format: mimetype.split('/')[1] || 'unknown',
    size: buffer.length,
  };
}
