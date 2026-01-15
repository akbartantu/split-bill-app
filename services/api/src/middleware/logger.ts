/**
 * Request Logger Middleware
 * 
 * Logs HTTP requests safely (never logs secrets).
 */

import { Request, Response, NextFunction } from 'express';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/**
 * Mask sensitive values in objects
 */
function maskSecrets(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const masked = { ...obj };
  const sensitiveKeys = ['password', 'token', 'key', 'secret', 'private_key', 'authorization'];
  
  for (const key of Object.keys(masked)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      masked[key] = '***MASKED***';
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSecrets(masked[key]);
    }
  }
  
  return masked;
}

/**
 * Request logger middleware
 */
export function logger(req: Request, res: Response, next: NextFunction): void {
  if (LOG_LEVEL === 'debug') {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData: any = {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
      };
      
      // Log query params (masked)
      if (Object.keys(req.query).length > 0) {
        logData.query = maskSecrets(req.query);
      }
      
      // Log body for non-GET requests (masked)
      if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
        logData.body = maskSecrets(req.body);
      }
      
      console.log('[Request]', JSON.stringify(logData));
    });
  }
  
  next();
}
