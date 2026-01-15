/**
 * API Client
 * 
 * Client for making requests to the API server.
 * Falls back to client-side processing if API is not available.
 */

import { apiBase, buildApiUrl } from '@/lib/apiBase';

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
  details?: any;
}

export interface ReceiptUploadResponse {
  success: boolean;
  receipt: {
    id: string;
    items: any[];
    confidence: number;
    needsReview: boolean;
  };
  message?: string;
  documentDetected?: boolean;
  detectionStrategy?: string;
}

/**
 * Generate request ID for correlation
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Upload receipt image to API with request correlation and timeout
 */
export async function uploadReceiptImage(
  file: File,
  billingId?: string,
  requestId?: string,
  onProgress?: (stage: string, progress: number) => void,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<ReceiptUploadResponse> {
  const reqId = requestId || generateRequestId();
  const startTime = Date.now();
  
  // Debug logging (dev only)
  if (import.meta.env.DEV) {
    console.log(`[API Client] [${reqId}] Starting upload`, {
      fileSize: file.size,
      fileType: file.type,
      timestamp: new Date().toISOString(),
      apiBase: apiBase || '(proxy)',
    });
  }
  
  // Validate file before upload
  if (!file || file.size === 0) {
    throw new Error('File is empty');
  }
  
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max: 5MB)`);
  }
  
  if (!file.type.startsWith('image/')) {
    throw new Error(`Invalid file type: ${file.type}`);
  }
  
  try {
    const formData = new FormData();
    formData.append('receipt_image', file);
    if (billingId) {
      formData.append('billing_id', billingId);
    }
    
    // Stage-based progress simulation
    onProgress?.('uploading', 5);
    
    // Add timeout to fetch (default 60 seconds)
    const TIMEOUT_MS = options?.timeoutMs ?? 60000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      if (import.meta.env.DEV) {
        console.warn(`[API Client] [${reqId}] Request timeout after ${TIMEOUT_MS}ms`);
      }
    }, TIMEOUT_MS);
    
    const onAbort = () => controller.abort();
    if (options?.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
    
    try {
      onProgress?.('uploading', 15);
      
      const response = await fetch(buildApiUrl('/api/receipts/upload'), {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          'X-Request-ID': reqId,
        },
      });
      
      clearTimeout(timeoutId);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      
      const duration = Date.now() - startTime;
      
      if (import.meta.env.DEV) {
        console.log(`[API Client] [${reqId}] Response received`, {
          status: response.status,
          duration: `${duration}ms`,
          url: buildApiUrl('/api/receipts/upload'),
        });
      }
      
      // Simulate processing stages
      onProgress?.('processing', 60);
      onProgress?.('parsing', 85);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ 
          message: `HTTP ${response.status}: ${response.statusText}` 
        }));
        
        if (import.meta.env.DEV) {
          console.error(`[API Client] [${reqId}] Error response`, error);
        }
        
        throw new Error(error.message || `HTTP ${response.status}`);
      }
      
      const result: ApiResponse<ReceiptUploadResponse> = await response.json();
      
      onProgress?.('parsing', 100);
      
      if (!result.ok) {
        throw new Error(result.message || result.code || 'Upload failed');
      }
      
      if (import.meta.env.DEV) {
        console.log(`[API Client] [${reqId}] Upload successful`, {
          duration: `${duration}ms`,
          itemCount: result.data?.receipt.items.length || 0,
        });
      }
      
      return result.data!;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      const duration = Date.now() - startTime;
      
      if (fetchError.name === 'AbortError') {
        if (import.meta.env.DEV) {
          console.error(`[API Client] [${reqId}] Request aborted (timeout)`, {
            duration: `${duration}ms`,
          });
        }
        throw new Error(`Upload timeout - server took too long to respond (${TIMEOUT_MS / 1000}s limit)`);
      }
      
      if (import.meta.env.DEV) {
        console.error(`[API Client] [${reqId}] Fetch error`, {
          error: fetchError.message,
          duration: `${duration}ms`,
        });
      }
      
      throw fetchError;
    }
  } catch (error: any) {
    // If API is not available, throw error so caller can fallback to client-side
    if (error.message?.includes('fetch') || 
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('Network request failed')) {
      if (import.meta.env.DEV) {
        console.warn(`[API Client] [${reqId}] Network error - API not available`);
      }
      throw new Error('API server not available - using client-side OCR');
    }
    throw error;
  }
}

/**
 * Check if API is available
 */
export async function checkApiHealth(
  timeoutMs = 2000,
  signal?: AbortSignal
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  
  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true });
  }
  
  try {
    const url = buildApiUrl('/api/health');
    if (import.meta.env.DEV) {
      console.log('[API Client] Health check', {
        url,
        apiBase: apiBase || '(proxy)',
        timeoutMs,
      });
    }
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

// Export request ID generator for use in components
export { generateRequestId };
