/**
 * Express App Setup
 * 
 * Configures Express with middleware, routes, and error handling.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import { receiptRoutes } from './routes/receipts';

export const app = express();

// Trust proxy (for deployment behind reverse proxy)
app.set('trust proxy', 1);

// CORS configuration
// Allow multiple origins (comma-separated) or default to common dev ports
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In development, allow any localhost origin
      if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Body parsing (JSON)
app.use(express.json({ limit: '10mb' }));

// URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(logger);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API health check (fast, no external calls)
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
app.use('/api/receipts', receiptRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler (must be last)
app.use(errorHandler);
