/**
 * Image Preprocessing Pipeline for OCR
 * 
 * Creates multiple preprocessed variants of receipt images optimized for OCR.
 * Different strategies work better for different receipt types.
 */

export interface PreprocessingVariant {
  name: string;
  imageData: string; // base64 data URL
  metadata: {
    strategy: string;
    width: number;
    height: number;
  };
}

/**
 * Preprocess receipt image with multiple strategies
 */
export async function preprocessReceiptImage(
  imageSource: File | string
): Promise<PreprocessingVariant[]> {
  try {
    const variants: PreprocessingVariant[] = [];
    
    // Load image with error handling
    const image = await loadImage(imageSource);
    const { width, height } = image;
    
    // Validate image dimensions
    if (width === 0 || height === 0) {
      throw new Error('Invalid image dimensions');
    }
    
    // Limit processing to prevent memory issues
    // Only create 2 variants instead of 4 to reduce memory usage
    // Strategy 1: Preserve Color (mild enhancement)
    try {
      variants.push(await createPreserveColorVariant(image, width, height));
    } catch (error: any) {
      console.warn('[Preprocess] Preserve color variant failed:', error.message);
    }
    
    // Strategy 2: Light (grayscale + mild contrast) - most reliable
    try {
      variants.push(await createLightVariant(image, width, height));
    } catch (error: any) {
      console.warn('[Preprocess] Light variant failed:', error.message);
    }
    
    // Only add more variants if we have memory headroom
    if (variants.length >= 2) {
      // Strategy 3: Balanced (denoise + adaptive threshold)
      try {
        variants.push(await createBalancedVariant(image, width, height));
      } catch (error: any) {
        console.warn('[Preprocess] Balanced variant failed:', error.message);
      }
    }
    
    // Ensure we have at least one variant
    if (variants.length === 0) {
      throw new Error('All preprocessing variants failed');
    }
    
    return variants;
  } catch (error: any) {
    throw new Error(`Preprocessing failed: ${error.message}`);
  }
}

/**
 * Load image from File or data URL
 */
function loadImage(source: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    
    if (source instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(source);
    } else {
      img.src = source;
    }
  });
}

/**
 * Strategy 1: Preserve Color - Keep color info with mild denoise and contrast
 */
async function createPreserveColorVariant(
  img: HTMLImageElement,
  width: number,
  height: number
): Promise<PreprocessingVariant> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  
  // Upscale 2x for better OCR
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  
  // Draw image with high-quality interpolation
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  // Apply mild contrast enhancement
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Mild contrast enhancement (preserve color)
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Increase contrast slightly
    const contrast = 1.2;
    data[i] = Math.max(0, Math.min(255, ((r / 255 - 0.5) * contrast + 0.5) * 255));
    data[i + 1] = Math.max(0, Math.min(255, ((g / 255 - 0.5) * contrast + 0.5) * 255));
    data[i + 2] = Math.max(0, Math.min(255, ((b / 255 - 0.5) * contrast + 0.5) * 255));
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  return {
    name: 'preserve_color',
    imageData: canvas.toDataURL('image/png'),
    metadata: {
      strategy: 'preserve_color',
      width: canvas.width,
      height: canvas.height,
    },
  };
}

/**
 * Strategy 2: Light - Grayscale + mild contrast
 */
async function createLightVariant(
  img: HTMLImageElement,
  width: number,
  height: number
): Promise<PreprocessingVariant> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Convert to grayscale
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    
    // Mild contrast enhancement
    const contrast = 1.3;
    const adjusted = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
    const final = Math.max(0, Math.min(255, adjusted));
    
    data[i] = final;
    data[i + 1] = final;
    data[i + 2] = final;
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  return {
    name: 'light',
    imageData: canvas.toDataURL('image/png'),
    metadata: {
      strategy: 'light',
      width: canvas.width,
      height: canvas.height,
    },
  };
}

/**
 * Strategy 3: Balanced - Denoise + adaptive threshold
 */
async function createBalancedVariant(
  img: HTMLImageElement,
  width: number,
  height: number
): Promise<PreprocessingVariant> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Convert to grayscale first
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  
  // Simple denoise (median-like filter for edges)
  const denoised = new Uint8ClampedArray(data);
  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < canvas.width - 1; x++) {
      const idx = (y * canvas.width + x) * 4;
      const neighbors = [
        data[idx - canvas.width * 4 - 4],
        data[idx - canvas.width * 4],
        data[idx - canvas.width * 4 + 4],
        data[idx - 4],
        data[idx],
        data[idx + 4],
        data[idx + canvas.width * 4 - 4],
        data[idx + canvas.width * 4],
        data[idx + canvas.width * 4 + 4],
      ];
      neighbors.sort((a, b) => a - b);
      denoised[idx] = neighbors[4]; // Median
      denoised[idx + 1] = neighbors[4];
      denoised[idx + 2] = neighbors[4];
    }
  }
  
  // Adaptive threshold (simplified - use local mean)
  const thresholded = new Uint8ClampedArray(denoised);
  const blockSize = 15;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      
      // Calculate local mean
      let sum = 0;
      let count = 0;
      for (let dy = -blockSize; dy <= blockSize; dy++) {
        for (let dx = -blockSize; dx <= blockSize; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < canvas.height && nx >= 0 && nx < canvas.width) {
            const nidx = (ny * canvas.width + nx) * 4;
            sum += denoised[nidx];
            count++;
          }
        }
      }
      const mean = sum / count;
      
      // Threshold
      const value = denoised[idx];
      const threshold = mean * 0.9; // Slight bias toward darker
      thresholded[idx] = value < threshold ? 0 : 255;
      thresholded[idx + 1] = thresholded[idx];
      thresholded[idx + 2] = thresholded[idx];
    }
  }
  
  const resultImageData = new ImageData(thresholded, canvas.width, canvas.height);
  ctx.putImageData(resultImageData, 0, 0);
  
  return {
    name: 'balanced',
    imageData: canvas.toDataURL('image/png'),
    metadata: {
      strategy: 'balanced',
      width: canvas.width,
      height: canvas.height,
    },
  };
}

/**
 * Strategy 4: Aggressive - Strong threshold + morphology
 */
async function createAggressiveVariant(
  img: HTMLImageElement,
  width: number,
  height: number
): Promise<PreprocessingVariant> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  
  // Strong contrast
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i];
    const contrast = 2.0;
    const adjusted = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
    data[i] = Math.max(0, Math.min(255, adjusted));
    data[i + 1] = data[i];
    data[i + 2] = data[i];
  }
  
  // Otsu-like threshold (simplified - use global mean)
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i];
  }
  const globalMean = sum / (data.length / 4);
  const threshold = globalMean * 0.85;
  
  // Apply threshold
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] < threshold ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  
  // Morphological close (connect broken characters)
  const closed = new Uint8ClampedArray(data);
  const kernelSize = 2;
  for (let y = kernelSize; y < canvas.height - kernelSize; y++) {
    for (let x = kernelSize; x < canvas.width - kernelSize; x++) {
      const idx = (y * canvas.width + x) * 4;
      let max = 0;
      for (let dy = -kernelSize; dy <= kernelSize; dy++) {
        for (let dx = -kernelSize; dx <= kernelSize; dx++) {
          const nidx = ((y + dy) * canvas.width + (x + dx)) * 4;
          max = Math.max(max, data[nidx]);
        }
      }
      closed[idx] = max;
      closed[idx + 1] = max;
      closed[idx + 2] = max;
    }
  }
  
  const resultImageData = new ImageData(closed, canvas.width, canvas.height);
  ctx.putImageData(resultImageData, 0, 0);
  
  return {
    name: 'aggressive',
    imageData: canvas.toDataURL('image/png'),
    metadata: {
      strategy: 'aggressive',
      width: canvas.width,
      height: canvas.height,
    },
  };
}
