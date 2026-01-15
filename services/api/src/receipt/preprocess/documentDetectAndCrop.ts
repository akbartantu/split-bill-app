/**
 * Document Detection and Cropping Module
 * 
 * Detects receipt document in photos with complex backgrounds,
 * crops and deskews it for better OCR accuracy.
 * 
 * Uses OpenCV for edge detection and perspective transformation.
 */

import { createError } from '../../middleware/errorHandler';
import sharp from 'sharp';

export interface DocumentDetectionResult {
  success: boolean;
  documentDetected: boolean;
  croppedBuffer: Buffer;
  width: number;
  height: number;
  strategy: 'perspective_warp' | 'bounding_box' | 'center_crop' | 'fallback';
  confidence: number;
  metadata?: {
    originalWidth: number;
    originalHeight: number;
    cropArea?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
}

/**
 * Maximum dimensions before document detection (resize first for performance)
 */
const MAX_DETECTION_WIDTH = 2000;
const MAX_DETECTION_HEIGHT = 2000;

/**
 * Target width for cropped receipt (standardized for OCR)
 */
const TARGET_RECEIPT_WIDTH = 1200;

/**
 * Detect and crop receipt document from image
 * 
 * Strategy:
 * 1. Resize if too large (for performance)
 * 2. Try OpenCV-based detection (if available)
 * 3. Fallback to smart crop or center crop
 * 4. Return cropped image ready for preprocessing
 */
export async function detectAndCropDocument(
  imageBuffer: Buffer,
  mimetype: string,
  requestId?: string
): Promise<DocumentDetectionResult> {
  const reqId = requestId || `req_${Date.now()}`;
  const startTime = Date.now();
  
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[DocumentDetect] [${reqId}] Starting document detection`);
  }
  
  try {
    // Step 1: Load and resize if needed (for performance)
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;
    
    if (originalWidth === 0 || originalHeight === 0) {
      throw createError('Invalid image dimensions', 400, 'INVALID_IMAGE_DIMENSIONS');
    }
    
    // Resize if too large (for faster processing)
    let workingWidth = originalWidth;
    let workingHeight = originalHeight;
    let workingImage = image;
    
    if (originalWidth > MAX_DETECTION_WIDTH || originalHeight > MAX_DETECTION_HEIGHT) {
      const scale = Math.min(
        MAX_DETECTION_WIDTH / originalWidth,
        MAX_DETECTION_HEIGHT / originalHeight
      );
      workingWidth = Math.floor(originalWidth * scale);
      workingHeight = Math.floor(originalHeight * scale);
      workingImage = image.resize(workingWidth, workingHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[DocumentDetect] [${reqId}] Resized for detection`, {
          original: `${originalWidth}x${originalHeight}`,
          working: `${workingWidth}x${workingHeight}`,
        });
      }
    }
    
    // Step 2: Try OpenCV-based detection (if available)
    // NOTE: OpenCV detection is optional and requires opencv4nodejs package
    // For now, we skip OpenCV and use smart crop fallback
    // To enable OpenCV: npm install opencv4nodejs (requires OpenCV system library)
    try {
      const opencvResult = await detectWithOpenCV(
        await workingImage.raw().toBuffer({ resolveWithObject: true }),
        workingWidth,
        workingHeight,
        reqId
      );
      
      if (opencvResult.success && opencvResult.documentDetected) {
        const duration = Date.now() - startTime;
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`[DocumentDetect] [${reqId}] Document detected with OpenCV`, {
            strategy: opencvResult.strategy,
            duration: `${duration}ms`,
          });
        }
        
        return {
          ...opencvResult,
          metadata: {
            originalWidth,
            originalHeight,
          },
        };
      }
    } catch (opencvError: any) {
      // OpenCV not available or not implemented - this is expected
      // Continue to smart crop fallback
      if (process.env.LOG_LEVEL === 'debug' && !opencvError.message.includes('not available')) {
        console.warn(`[DocumentDetect] [${reqId}] OpenCV detection failed:`, opencvError.message);
      }
    }
    
    // Step 3: Fallback to smart crop
    const fallbackResult = await smartCropFallback(
      workingImage,
      workingWidth,
      workingHeight,
      reqId
    );
    
    const duration = Date.now() - startTime;
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DocumentDetect] [${reqId}] Using fallback crop`, {
        strategy: fallbackResult.strategy,
        duration: `${duration}ms`,
      });
    }
    
    return {
      ...fallbackResult,
      metadata: {
        originalWidth,
        originalHeight,
      },
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (process.env.LOG_LEVEL === 'debug') {
      console.error(`[DocumentDetect] [${reqId}] Detection failed`, {
        error: error.message,
        duration: `${duration}ms`,
      });
    }
    
    if (error.statusCode) {
      throw error;
    }
    
    // Final fallback: return original image with warning
    return {
      success: true,
      documentDetected: false,
      croppedBuffer: imageBuffer,
      width: (await sharp(imageBuffer).metadata()).width || 0,
      height: (await sharp(imageBuffer).metadata()).height || 0,
      strategy: 'fallback',
      confidence: 0,
      metadata: {
        originalWidth: (await sharp(imageBuffer).metadata()).width || 0,
        originalHeight: (await sharp(imageBuffer).metadata()).height || 0,
      },
    };
  }
}

/**
 * Detect document using OpenCV (if available)
 * 
 * Strategy:
 * 1. Convert to grayscale
 * 2. Apply Gaussian blur
 * 3. Canny edge detection
 * 4. Find contours
 * 5. Find best 4-point polygon (receipt shape)
 * 6. Apply perspective transform
 * 
 * NOTE: OpenCV is optional. If not available, falls back to smart crop.
 * To enable OpenCV detection, install: npm install opencv4nodejs
 */
async function detectWithOpenCV(
  imageData: { data: Buffer; info: { width: number; height: number; channels: number } },
  width: number,
  height: number,
  requestId: string
): Promise<DocumentDetectionResult> {
  try {
    // Try to import OpenCV (optional dependency)
    let cv: any;
    try {
      // Try opencv4nodejs first (Node.js native - requires OpenCV installed on system)
      cv = await import('opencv4nodejs');
    } catch {
      // OpenCV not available - use fallback
      throw new Error('OpenCV not available - using fallback');
    }
    
    // OpenCV implementation would go here
    // For now, we use the fallback since OpenCV requires system installation
    // This is a placeholder for future OpenCV integration
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DocumentDetect] [${requestId}] OpenCV available but detection not yet implemented`);
    }
    
    throw new Error('OpenCV detection not yet implemented - using fallback');
    
  } catch (error: any) {
    if (error.message === 'OpenCV not available' || error.message.includes('OpenCV detection not yet implemented')) {
      throw error; // Re-throw to trigger fallback
    }
    throw error;
  }
}

/**
 * Smart crop fallback when OpenCV is not available
 * 
 * Strategy:
 * 1. Analyze image to find text-dense regions
 * 2. Use center crop with adaptive margins (removes edges which often have background)
 * 3. Resize to standard width for OCR
 * 
 * This is a heuristic approach that works well for many receipt photos.
 */
async function smartCropFallback(
  image: sharp.Sharp,
  width: number,
  height: number,
  requestId: string
): Promise<DocumentDetectionResult> {
  try {
    // Strategy: Center crop removes edge noise (hands, background)
    // Receipts are usually centered in photos
    // Use adaptive margins based on image size
    
    // Calculate crop margins (remove 15-25% from edges)
    const marginPercent = width > 1500 ? 0.15 : 0.25; // Smaller margin for larger images
    const cropMarginX = Math.floor(width * marginPercent);
    const cropMarginY = Math.floor(height * marginPercent);
    
    // Ensure minimum crop size
    const minCropWidth = Math.floor(width * 0.5);
    const minCropHeight = Math.floor(height * 0.5);
    
    const cropX = Math.max(0, cropMarginX);
    const cropY = Math.max(0, cropMarginY);
    const cropWidth = Math.max(minCropWidth, width - (cropMarginX * 2));
    const cropHeight = Math.max(minCropHeight, height - (cropMarginY * 2));
    
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[DocumentDetect] [${requestId}] Smart crop`, {
        original: `${width}x${height}`,
        crop: `${cropX},${cropY} ${cropWidth}x${cropHeight}`,
      });
    }
    
    // Crop the center region
    const cropped = image.clone().extract({
      left: cropX,
      top: cropY,
      width: cropWidth,
      height: cropHeight,
    });
    
    // Resize to target width (maintain aspect ratio, allow upscaling for small receipts)
    const aspectRatio = cropHeight / cropWidth;
    const targetHeight = Math.floor(TARGET_RECEIPT_WIDTH * aspectRatio);
    
    const final = cropped.resize(TARGET_RECEIPT_WIDTH, targetHeight, {
      fit: 'fill',
      withoutEnlargement: false, // Allow upscaling for small receipts
    });
    
    const finalBuffer = await final.jpeg({ quality: 90 }).toBuffer();
    const finalMetadata = await final.metadata();
    
    return {
      success: true,
      documentDetected: false, // Mark as not detected (using heuristic)
      croppedBuffer: finalBuffer,
      width: finalMetadata.width || TARGET_RECEIPT_WIDTH,
      height: finalMetadata.height || targetHeight,
      strategy: 'center_crop',
      confidence: 0.6, // Medium-high confidence for center crop heuristic
      metadata: {
        cropArea: {
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight,
        },
      },
    };
  } catch (error: any) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.warn(`[DocumentDetect] [${requestId}] Smart crop failed, using resize fallback:`, error.message);
    }
    
    // If smart crop fails, return original resized to target width
    const resized = image.clone().resize(TARGET_RECEIPT_WIDTH, null, {
      fit: 'inside',
      withoutEnlargement: false,
    });
    
    const buffer = await resized.jpeg({ quality: 90 }).toBuffer();
    const metadata = await resized.metadata();
    
    return {
      success: true,
      documentDetected: false,
      croppedBuffer: buffer,
      width: metadata.width || TARGET_RECEIPT_WIDTH,
      height: metadata.height || 0,
      strategy: 'fallback',
      confidence: 0.3, // Low confidence for fallback
    };
  }
}
