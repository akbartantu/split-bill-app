/**
 * Thermal Receipt Detection and Cropping
 *
 * Optimized preprocessing for thermal restaurant receipts:
 * - Narrow paper format
 * - Hand-held background
 * - Column alignment preservation
 * - CLAHE contrast enhancement
 * - Light denoise (preserve text edges)
 */
import sharp from 'sharp';
/**
 * Maximum dimensions before detection (resize first for performance)
 */
const MAX_DETECTION_WIDTH = 1600;
const MAX_DETECTION_HEIGHT = 1600;
/**
 * Target width for thermal receipt (narrow format, standardized for OCR)
 */
const TARGET_RECEIPT_WIDTH = 1200;
/**
 * Minimum dimension for OCR (upscale small receipts so text is readable)
 */
const MIN_DIMENSION_FOR_OCR = 800;
/**
 * Detect and crop thermal receipt from image
 *
 * Pipeline:
 * 1. Resize if too large
 * 2. Convert to grayscale
 * 3. Apply CLAHE for contrast
 * 4. Light denoise
 * 5. Detect document (edge detection + contour)
 * 6. Crop and standardize
 */
export async function detectAndCropReceipt(imageBuffer, mimetype, requestId) {
    const reqId = requestId || `req_${Date.now()}`;
    // New behavior: do not crop thermal receipts at all.
    // Always pass the original image buffer through to OCR.
    if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[ReceiptDetect] [${reqId}] Thermal detection disabled, using original image (no crop)`);
    }
    const meta = await sharp(imageBuffer).metadata();
    return {
        success: true,
        documentDetected: false,
        croppedBuffer: imageBuffer,
        width: meta.width || 0,
        height: meta.height || 0,
        strategy: 'fallback',
        confidence: 0,
        metadata: {
            originalWidth: meta.width || 0,
            originalHeight: meta.height || 0,
        },
    };
}
/**
 * Smart crop optimized for thermal receipts
 *
 * Thermal receipts are typically:
 * - Narrow (tall aspect ratio)
 * - Centered in photo
 * - Have clear text columns
 *
 * Strategy:
 * 1. Center crop with adaptive margins (removes background/hands)
 * 2. Resize to standard width for OCR
 * 3. Preserve aspect ratio
 */
async function smartCropForThermalReceipt(image, width, height, requestId) {
    try {
        // Thermal receipts are narrow - balanced margins (avoid cutting items, avoid too much background)
        const marginX = Math.floor(width * 0.2); // 20% from sides
        const marginY = Math.floor(height * 0.12); // 12% from top/bottom
        const minCropWidth = Math.floor(width * 0.5);
        const minCropHeight = Math.floor(height * 0.6);
        const cropX = Math.max(0, marginX);
        const cropY = Math.max(0, marginY);
        const cropWidth = Math.max(minCropWidth, width - (marginX * 2));
        const cropHeight = Math.max(minCropHeight, height - (marginY * 2));
        if (process.env.LOG_LEVEL === 'debug') {
            console.log(`[ReceiptDetect] [${requestId}] Thermal crop`, {
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
        // Resize to target width; upscale if receipt is small so OCR can read all lines
        const aspectRatio = cropHeight / cropWidth;
        let targetW = TARGET_RECEIPT_WIDTH;
        let targetH = Math.floor(TARGET_RECEIPT_WIDTH * aspectRatio);
        if (cropWidth < MIN_DIMENSION_FOR_OCR || cropHeight < MIN_DIMENSION_FOR_OCR) {
            const scale = Math.max(MIN_DIMENSION_FOR_OCR / cropWidth, MIN_DIMENSION_FOR_OCR / cropHeight);
            targetW = Math.min(TARGET_RECEIPT_WIDTH, Math.round(cropWidth * scale));
            targetH = Math.round(cropHeight * scale);
        }
        const final = cropped.resize(targetW, targetH, {
            fit: 'fill',
            withoutEnlargement: false,
        });
        const finalBuffer = await final.jpeg({ quality: 90 }).toBuffer();
        const finalMetadata = await final.metadata();
        return {
            success: true,
            documentDetected: false, // Mark as heuristic (not true detection)
            croppedBuffer: finalBuffer,
            width: finalMetadata.width || targetW,
            height: finalMetadata.height || targetH,
            strategy: 'center_crop',
            confidence: 0.65, // Medium-high confidence for thermal receipt heuristic
            metadata: {
                originalWidth: width,
                originalHeight: height,
                cropArea: {
                    x: cropX,
                    y: cropY,
                    width: cropWidth,
                    height: cropHeight,
                },
            },
        };
    }
    catch (error) {
        if (process.env.LOG_LEVEL === 'debug') {
            console.warn(`[ReceiptDetect] [${requestId}] Smart crop failed, using resize fallback:`, error.message);
        }
        // If smart crop fails, return resized original
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
            confidence: 0.3,
        };
    }
}
