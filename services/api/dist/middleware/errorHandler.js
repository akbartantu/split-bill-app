/**
 * Global Error Handler Middleware
 *
 * Catches all errors and returns consistent JSON responses.
 * Never crashes the server.
 */
import { MulterError } from 'multer';
/**
 * Global error handler
 */
export function errorHandler(err, req, res, next) {
    // Log error safely (never log secrets)
    const logLevel = process.env.LOG_LEVEL || 'info';
    if (logLevel === 'debug') {
        console.error('[Error Handler]', {
            message: err.message,
            stack: err.stack?.split('\n').slice(0, 5).join('\n'), // Limit stack trace
            path: req.path,
            method: req.method,
            code: 'code' in err ? err.code : undefined,
        });
    }
    else {
        console.error('[Error Handler]', err.message, 'code:', 'code' in err ? err.code : 'UNKNOWN');
    }
    // Handle Multer errors (file upload)
    if (err.name === 'MulterError' || err instanceof MulterError) {
        const multerErr = err;
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({
                ok: false,
                code: 'FILE_TOO_LARGE',
                message: 'File size exceeds maximum allowed (5MB)',
            });
            return;
        }
        if (multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
            res.status(400).json({
                ok: false,
                code: 'INVALID_FILE_FIELD',
                message: 'Unexpected file field name. Use "receipt_image"',
            });
            return;
        }
        if (multerErr.code === 'LIMIT_FILE_COUNT') {
            res.status(400).json({
                ok: false,
                code: 'TOO_MANY_FILES',
                message: 'Only one file allowed',
            });
            return;
        }
        res.status(400).json({
            ok: false,
            code: 'UPLOAD_ERROR',
            message: `File upload failed: ${multerErr.message}`,
        });
        return;
    }
    // Handle custom API errors
    if ('statusCode' in err && err.statusCode) {
        const statusCode = err.statusCode;
        const response = {
            ok: false,
            code: err.code || 'API_ERROR',
            message: err.message || 'An error occurred',
        };
        // Include details only in development
        if (process.env.NODE_ENV === 'development' && 'details' in err) {
            response.details = err.details;
        }
        res.status(statusCode).json(response);
        return;
    }
    // Handle validation errors
    if (err.name === 'ValidationError') {
        res.status(400).json({
            ok: false,
            code: 'VALIDATION_ERROR',
            message: err.message || 'Validation failed',
        });
        return;
    }
    // Default: 500 Internal Server Error
    // Never crash - always return a response
    const response = {
        ok: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: process.env.NODE_ENV === 'production'
            ? 'An internal error occurred'
            : err.message || 'Unknown error',
    };
    // Include details only in development
    if (process.env.NODE_ENV === 'development' && err.stack) {
        response.details = {
            stack: err.stack.split('\n').slice(0, 10), // Limit stack trace
        };
    }
    res.status(500).json(response);
}
/**
 * Create an API error
 */
export function createError(message, statusCode = 500, code, details) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.details = details;
    return error;
}
