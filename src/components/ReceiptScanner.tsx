import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, X, RotateCcw, Check, AlertCircle, Loader2, Edit, Pencil } from 'lucide-react';
import { EditReceiptItem, type EditableReceiptItem } from '@/components/EditReceiptItem';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { scanReceiptFull, type ScanReceiptResult, type ParsedReceipt, type ParsedItem } from '@/lib/ocr';
import { parseReceiptText } from '@/lib/ocr/parser';
import { uploadReceiptImage, checkApiHealth, generateRequestId } from '@/services/apiClient';
import { cn } from '@/lib/utils';

interface ReceiptScannerProps {
  open: boolean;
  onClose: () => void;
  onComplete: (receipt: ParsedReceipt, targetReceiptId?: string | null) => void;
  targetReceiptId?: string | null;
  currencyCode?: string;
}

type ScanStage = 'capture' | 'processing' | 'review';

type ProcessingState = 'idle' | 'checking' | 'uploading' | 'processing' | 'done' | 'error' | 'timeout' | 'canceled';

export function ReceiptScanner({ open, onClose, onComplete, targetReceiptId, currencyCode = 'USD' }: ReceiptScannerProps) {
  const [stage, setStage] = useState<ScanStage>('capture');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedReceipt | null>(null);
  const [scanResult, setScanResult] = useState<ScanReceiptResult | null>(null);
  const [manualEntryText, setManualEntryText] = useState<string>('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [requestId, setRequestId] = useState<string>('');
  const [editingItem, setEditingItem] = useState<EditableReceiptItem | null>(null);
  const [apiCheckFailed, setApiCheckFailed] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stuckDetectionRef = useRef<NodeJS.Timeout | null>(null);
  const progressCheckRef = useRef<NodeJS.Timeout | null>(null);

  const reset = useCallback(() => {
    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear timeouts
    if (stuckDetectionRef.current) {
      clearTimeout(stuckDetectionRef.current);
      stuckDetectionRef.current = null;
    }
    if (progressCheckRef.current) {
      clearInterval(progressCheckRef.current);
      progressCheckRef.current = null;
    }
    
    setStage('capture');
    setImagePreview(null);
    setSelectedFile(null);
    setProgress(0);
    setProgressStage('');
    setError(null);
    setResult(null);
    setScanResult(null);
    setManualEntryText('');
    setShowManualEntry(false);
    setProcessingState('idle');
    setRequestId('');
    setApiCheckFailed(false);
  }, []);
  
  // Stuck detection: if progress stays at 0% for >5 seconds, show warning
  useEffect(() => {
    if (processingState === 'processing' && progress === 0) {
      stuckDetectionRef.current = setTimeout(() => {
        if (progress === 0 && processingState === 'processing') {
          console.warn(`[ReceiptScanner] [${requestId}] Stuck at 0% for >5s - still working...`);
          // Progress will be updated by stage-based progress
        }
      }, 5000);
      
      return () => {
        if (stuckDetectionRef.current) {
          clearTimeout(stuckDetectionRef.current);
        }
      };
    }
  }, [processingState, progress, requestId]);
  
  // Progress check: ensure progress moves forward
  useEffect(() => {
    if (processingState === 'processing' || processingState === 'uploading') {
      let lastProgress = progress;
      progressCheckRef.current = setInterval(() => {
        // If progress hasn't changed in 10 seconds, something is wrong
        if (progress === lastProgress && progress < 100) {
          console.warn(`[ReceiptScanner] [${requestId}] Progress stuck at ${progress}%`);
        }
        lastProgress = progress;
      }, 10000);
      
      return () => {
        if (progressCheckRef.current) {
          clearInterval(progressCheckRef.current);
        }
      };
    }
  }, [processingState, progress, requestId]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (import.meta.env.DEV) {
        console.log('[ReceiptScanner] File selected', {
          name: file.name,
          size: file.size,
          type: file.type,
        });
      }
      processFile(file);
    }
  };

  const processFile = async (file: File, options?: { forceClient?: boolean }) => {
    setApiCheckFailed(false);
    // Validate file before processing
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPEG, PNG, or WebP)');
      setStage('capture');
      return;
    }
    
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      setError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size: 10MB`);
      setStage('capture');
      return;
    }
    
    if (file.size === 0) {
      setError('File is empty. Please select a valid image.');
      setStage('capture');
      return;
    }
    
    setSelectedFile(file);
    setError(null);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.onerror = () => {
      setError('Failed to read image file. Please try again.');
      setStage('capture');
    };
    reader.readAsDataURL(file);
    
    // Generate request ID for correlation
    const reqId = generateRequestId();
    setRequestId(reqId);
    
    // Create abort controller for timeout
    abortControllerRef.current = new AbortController();
    if (abortControllerRef.current.signal.aborted) {
      setProcessingState('canceled');
      return;
    }
    
    // Start scanning
    setStage('processing');
    setProcessingState('uploading');
    setProgress(0);
    
    const startTime = Date.now();
    
    if (import.meta.env.DEV) {
      console.log(`[ReceiptScanner] [${reqId}] Starting scan`, {
        fileSize: file.size,
        fileType: file.type,
        timestamp: new Date().toISOString(),
      });
    }
    
    try {
      // Try API first, fallback to client-side
      let fullResult: ScanReceiptResult;
      const forceClient = options?.forceClient === true;
      let apiWasAvailable = false;

      const runClientSideOcr = async () => {
        setProcessingState('processing');
        setProgressStage('detecting');
        setProgress(5);
        
        // Client-side OCR with timeout (60 seconds max)
        const CLIENT_TIMEOUT = 60000;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('OCR processing timed out. Please try with a clearer image.'));
          }, CLIENT_TIMEOUT);
        });
        
        const ocrPromise = scanReceiptFull(file, (stage, prog) => {
          if (abortControllerRef.current?.signal.aborted) {
            return;
          }
          setProgressStage(stage);
          // Map client-side stages to progress
          let mappedProgress = 10;
          if (stage === 'preprocessing') {
            mappedProgress = 10 + (prog * 0.2); // 10-30%
          } else if (stage === 'scanning') {
            mappedProgress = 30 + (prog * 0.5); // 30-80%
          } else if (stage === 'parsing') {
            mappedProgress = 80 + (prog * 0.2); // 80-100%
          }
          setProgress(mappedProgress);
        });
        
        const result = await Promise.race([ocrPromise, timeoutPromise]);
        if (abortControllerRef.current?.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        return result;
      };
      
      try {
        if (forceClient) {
          fullResult = await runClientSideOcr();
          setProcessingState('done');
        } else {
        // Check if API is available (quick check)
        setProgressStage('checking');
        setProcessingState('checking');
        setProgress(5);
        
        const apiAvailable = await checkApiHealth(2000, abortControllerRef.current?.signal);
        
        if (apiAvailable) {
          apiWasAvailable = true;
          // Use API with progress callback
          setProcessingState('uploading');
          setProgressStage('uploading');
          
          const apiResult = await uploadReceiptImage(
            file,
            undefined,
            reqId,
            (stage, prog) => {
              setProgressStage(stage);
              setProgress(prog);
              if (stage === 'uploading') {
                setProcessingState('uploading');
              } else if (stage === 'processing') {
                setProcessingState('processing');
              }
            },
            {
              signal: abortControllerRef.current?.signal,
              timeoutMs: 60000,
            }
          );
          
          // Convert API response to ScanReceiptResult format
          fullResult = {
            success: apiResult.success,
            receipt: {
              items: apiResult.receipt.items.map((item: any) => ({
                id: item.id || generateId(),
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
                confidence: item.confidence || 0.7,
                needsReview: item.needsReview || false,
                rawText: item.rawText || item.name,
                reviewReasons: item.reviewReasons || [],
                correctionMetadata: item.correctionMetadata,
              })),
              confidence: apiResult.receipt.confidence,
              rawText: '',
            },
            needsManualEntry: apiResult.receipt.needsReview || apiResult.receipt.items.length === 0,
            rawOCRText: '',
            documentDetected: apiResult.documentDetected,
            detectionStrategy: apiResult.detectionStrategy,
          };
          
          setProcessingState('done');
        } else {
          throw new Error('API not reachable. Please start the server and try again.');
        }
        }
      } catch (apiError: any) {
        if (apiError?.name === 'AbortError') {
          throw apiError;
        }
        
        if (apiError.message?.includes('API not reachable')) {
          setApiCheckFailed(true);
          throw apiError;
        }

        const isNetworkError = Boolean(
          apiError.message?.includes('API server not available') ||
          apiError.message?.includes('Network') ||
          apiError.message?.includes('Failed to fetch') ||
          apiError.message?.includes('Upload timeout') ||
          apiError.message?.includes('timeout')
        );

        // If API was reachable but scan failed, surface server error
        if (apiWasAvailable && !isNetworkError) {
          throw new Error(`Scan failed: ${apiError.message}`);
        }
        
        // Fallback to client-side OCR
        if (apiError.message?.includes('API server not available') || 
            apiError.message?.includes('timeout')) {
          if (import.meta.env.DEV) {
            console.log(`[ReceiptScanner] [${reqId}] Using client-side OCR (API not available)`);
          }
        } else {
          if (import.meta.env.DEV) {
            console.warn(`[ReceiptScanner] [${reqId}] API failed, falling back to client-side OCR:`, apiError.message);
          }
        }
        
        // Reset progress for client-side processing
        fullResult = await runClientSideOcr();
        setProcessingState('done');
      }
      
      const duration = Date.now() - startTime;
      
      if (import.meta.env.DEV) {
        console.log(`[ReceiptScanner] [${reqId}] Scan completed`, {
          duration: `${duration}ms`,
          itemCount: fullResult.receipt.items.length,
          success: fullResult.success,
        });
      }
      
      setScanResult(fullResult);
      setResult(fullResult.receipt);
      
      // If needs manual entry, show manual entry UI
      if (fullResult.needsManualEntry && fullResult.receipt.items.length === 0) {
        setManualEntryText(fullResult.rawOCRText || '');
        setShowManualEntry(true);
      } else {
        setShowManualEntry(false);
      }
      
      setProgress(100);
      setStage('review');
    } catch (err: any) {
      const duration = Date.now() - startTime;
      
      if (import.meta.env.DEV) {
        console.error(`[ReceiptScanner] [${reqId}] Scan failed`, {
          error: err.message,
          duration: `${duration}ms`,
        });
      }
      
      // Determine error state
      let errorState: ProcessingState = 'error';
      if (err.name === 'AbortError') {
        errorState = 'canceled';
      } else if (err.message?.includes('timeout') || err.message?.includes('timed out')) {
        errorState = 'timeout';
      }
      setProcessingState(errorState);
      
      // Provide specific error messages
      let errorMessage = 'Failed to scan receipt. Please try again with a clearer image.';
      
      if (err.name === 'AbortError') {
        errorMessage = 'Scan canceled.';
      } else if (err.message?.includes('API not reachable')) {
        errorMessage = 'API not reachable. Start the server and try again.';
      } else if (err.message?.includes('timeout') || err.message?.includes('timed out')) {
        errorMessage = 'Scan took too long (60s limit). Try a clearer image or use manual input.';
      } else if (err.message?.includes('Failed to load image')) {
        errorMessage = 'Failed to load image. The file might be corrupted. Please try a different image.';
      } else if (err.message?.includes('memory')) {
        errorMessage = 'Image processing requires too much memory. Please try a smaller image.';
      } else if (err.message?.includes('File too large') || err.message?.includes('too large')) {
        const sizeMatch = err.message.match(/(\d+\.?\d*)\s*MB/);
        const maxMatch = err.message.match(/max:\s*(\d+)\s*MB/i);
        if (sizeMatch && maxMatch) {
          errorMessage = `Image file is too large (${sizeMatch[1]}MB). Maximum size: ${maxMatch[1]}MB.`;
        } else {
          errorMessage = 'Image file is too large. Maximum size: 10MB.';
        }
      } else if (err.message?.includes('Invalid file type') || err.message?.includes('file type')) {
        errorMessage = 'Invalid file type. Please upload a JPEG, PNG, or WebP image.';
      } else if (err.message?.includes('Upload timeout')) {
        errorMessage = 'Server took too long to process (30s limit). Please try again or use a smaller image.';
      }
      
      setError(errorMessage);
      setStage('capture');
      setProgress(0);
    } finally {
      // Cleanup
      abortControllerRef.current = null;
      if (stuckDetectionRef.current) {
        clearTimeout(stuckDetectionRef.current);
        stuckDetectionRef.current = null;
      }
      if (progressCheckRef.current) {
        clearInterval(progressCheckRef.current);
        progressCheckRef.current = null;
      }
    }
  };
  
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      if (import.meta.env.DEV) {
        console.log(`[ReceiptScanner] [${requestId}] Scan cancelled by user`);
      }
    }
    reset();
  };
  
  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleConfirm = () => {
    if (result) {
      onComplete(result, targetReceiptId);
      handleClose();
    }
  };

  const getProgressLabel = () => {
    switch (progressStage) {
      case 'checking':
        return 'Checking API...';
      case 'uploading':
        return 'Uploading image...';
      case 'detecting':
        return 'Detecting receipt...';
      case 'preprocessing':
        return 'Preparing image...';
      case 'scanning':
        return 'Reading text...';
      case 'parsing':
        return 'Extracting items...';
      default:
        return 'Processing...';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'text-success';
    if (confidence >= 0.4) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Scan Receipt
            </DialogTitle>
            <DialogDescription>
              Upload or take a photo of your receipt to automatically extract items and prices
            </DialogDescription>
          </DialogHeader>

        <AnimatePresence mode="wait">
          {stage === 'capture' && (
            <motion.div
              key="capture"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {error && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                  {apiCheckFailed && selectedFile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => processFile(selectedFile, { forceClient: true })}
                      className="w-full"
                    >
                      Try Client-Side OCR Instead
                    </Button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                <motion.button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Camera className="w-7 h-7 text-primary" />
                  </div>
                  <span className="font-medium">Take Photo</span>
                  <span className="text-xs text-muted-foreground">Use camera</span>
                </motion.button>

                <motion.button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-primary" />
                  </div>
                  <span className="font-medium">Upload Image</span>
                  <span className="text-xs text-muted-foreground">From gallery</span>
                </motion.button>
              </div>

                <div className="text-center text-sm text-muted-foreground">
                  <p>For best results, ensure the receipt is:</p>
                  <ul className="mt-2 space-y-1">
                    <li>• Well-lit and in focus</li>
                    <li>• Flat without folds or wrinkles</li>
                    <li>• Fully visible in the frame</li>
                    <li>• On a plain background (avoid hands/floor)</li>
                    <li>• Fill the frame with the receipt</li>
                  </ul>
                </div>
            </motion.div>
          )}

            {stage === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 py-8"
              >
                {imagePreview && (
                  <div className="relative mx-auto w-32 h-40 rounded-lg overflow-hidden shadow-lg">
                    <img
                      src={imagePreview}
                      alt="Receipt"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-foreground/20 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{getProgressLabel()}</span>
                    <span className="font-mono">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  
                  {/* Stuck detection message */}
                  {progress === 0 && processingState !== 'idle' && (
                    <p className="text-xs text-center text-muted-foreground mt-2">
                      Still working...
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-center text-sm text-muted-foreground">
                    This may take a moment...
                  </p>
                  
                  {/* Cancel button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="w-full"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}

          {stage === 'review' && result && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
                {/* Document Detection Warning - Only show if truly failed */}
                {scanResult && scanResult.documentDetected === false && 
                 scanResult.detectionStrategy === 'fallback' && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm">
                    <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-warning">Receipt area not clearly detected</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Couldn't isolate receipt from background. Try a photo with the receipt filling the frame on a plain background.
                      </p>
                    </div>
                  </div>
                )}

                {/* Items need review warning - Only if there are items needing review */}
                {result && result.items.some(item => item.needsReview) && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm">
                    <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-warning">Some items may need correction</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {result.items.filter(item => item.needsReview).length} item{result.items.filter(item => item.needsReview).length !== 1 ? 's' : ''} flagged for review. Please check and edit if needed.
                      </p>
                    </div>
                  </div>
                )}

                {/* Confidence indicator */}
                <div className={cn(
                  "flex items-center gap-2 p-3 rounded-lg text-sm",
                  result.confidence >= 0.7 ? "bg-success/10" :
                  result.confidence >= 0.4 ? "bg-warning/10" : "bg-destructive/10"     
                )}>
                  {result.confidence >= 0.7 ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <AlertCircle className={cn("w-4 h-4", getConfidenceColor(result.confidence))} />
                  )}
                  <span className={getConfidenceColor(result.confidence)}>
                    {result.confidence >= 0.7
                      ? "Good scan quality"
                      : result.confidence >= 0.4
                        ? "Some items may need correction"
                        : "Low quality - please review carefully"}
                  </span>
                </div>

              {/* Merchant & Date */}
              {(result.merchant || result.date) && (
                <div className="p-3 bg-secondary/50 rounded-lg text-sm">
                  {result.merchant && <p className="font-medium">{result.merchant}</p>}
                  {result.date && <p className="text-muted-foreground">{result.date}</p>}
                </div>
              )}


              {/* Totals */}
              {(result.subtotal || result.tax || result.total) && (
                <div className="p-3 bg-secondary/50 rounded-lg text-sm space-y-1">
                  {result.subtotal && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${result.subtotal.toFixed(2)}</span>
                    </div>
                  )}
                  {result.tax && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax</span>
                      <span>${result.tax.toFixed(2)}</span>
                    </div>
                  )}
                  {result.serviceCharge && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Service</span>
                      <span>${result.serviceCharge.toFixed(2)}</span>
                    </div>
                  )}
                  {result.total && (
                    <div className="flex justify-between font-medium pt-1 border-t border-border">
                      <span>Total</span>
                      <span>${result.total.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Entry Fallback */}
              {showManualEntry && (
                <div className="space-y-3 p-4 bg-warning/10 rounded-lg border border-warning/20">
                  <div className="flex items-center gap-2 text-warning">
                    <AlertCircle className="w-4 h-4" />
                    <p className="text-sm font-medium">Items not detected automatically</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Edit the OCR text below and click "Extract Items" to try parsing again.
                  </p>
                  <Textarea
                    value={manualEntryText}
                    onChange={(e) => setManualEntryText(e.target.value)}
                    placeholder="Paste or edit receipt text here..."
                    className="min-h-32 font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      try {
                        const parsed = parseReceiptText(manualEntryText);
                        setResult(parsed);
                        setShowManualEntry(parsed.items.length === 0);
                      } catch (err) {
                        console.error('Parse error:', err);
                        setError('Failed to parse text. Please check the format.');
                      }
                    }}
                    className="w-full"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Extract Items
                  </Button>
                </div>
              )}

              {/* Items List */}
              {result.items.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {result.items.length} item{result.items.length !== 1 ? 's' : ''} detected
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {result.items.map((item) => {
                      const editableItem: EditableReceiptItem = {
                        ...item,
                        isEdited: false,
                      };
                      
                      return (
                        <div 
                          key={item.id}
                          className={cn(
                            "flex justify-between items-center p-2 rounded-lg text-sm border group",
                            item.confidence >= 0.7 && !item.needsReview
                              ? "bg-card border-border hover:border-primary/50" 
                              : "bg-warning/10 border-warning/30 hover:border-warning/50"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="break-words">{item.name}</p>
                              {item.needsReview && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">
                                  Review
                                </span>
                              )}
                              {(item as any).isEdited && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                                  Edited
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              {item.quantity > 1 && (
                                <span>Qty: {item.quantity}</span>
                              )}
                              {item.unitPrice !== null && (
                                <span>• ${item.unitPrice.toFixed(2)} each</span>
                              )}
                              {item.reviewReasons && item.reviewReasons.length > 0 && (
                                <span className="text-warning" title={item.reviewReasons.join('; ')}>
                                  ⚠️ {item.reviewReasons[0]}
                                </span>
                              )}
                              <span className={cn(
                                "ml-auto",
                                item.confidence >= 0.7 ? "text-success" : 
                                item.confidence >= 0.4 ? "text-warning" : "text-destructive"
                              )}>
                                {Math.round(item.confidence * 100)}% confidence
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <span className="font-mono">${item.totalPrice.toFixed(2)}</span>
                            <button
                              onClick={() => setEditingItem(editableItem)}
                              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              title="Edit item"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : !showManualEntry && (
                <div className="text-center py-4 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium mb-1">No items detected</p>
                  <p className="text-xs">Try scanning again or use manual entry</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={reset}
                  className="flex-1"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={result.items.length === 0 && !showManualEntry}
                  className="flex-1"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {result.items.length > 0 ? 'Use Items' : 'Continue Manually'}
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Click the edit icon to modify items before importing
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Item Dialog */}
        {editingItem && (
          <EditReceiptItem
            item={editingItem}
            currencyCode={currencyCode}
            onSave={(updated) => {
              // Update the item in result
              if (result) {
                const updatedItems = result.items.map(i => 
                  i.id === updated.id ? updated : i
                );
                setResult({ ...result, items: updatedItems });
                
                // Recalculate totals if needed
                const newSubtotal = updatedItems.reduce((sum, i) => sum + i.totalPrice, 0);
                if (result.subtotal !== undefined) {
                  setResult({ ...result, items: updatedItems, subtotal: newSubtotal });
                }
              }
              setEditingItem(null);
            }}
            onCancel={() => setEditingItem(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
