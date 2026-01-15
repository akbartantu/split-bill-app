/**
 * API Server Entry Point
 * 
 * Starts the Express server with all routes and middleware.
 */

import { app } from './app';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Global error handlers (must be before server starts)
// These prevent the server from crashing on unhandled errors
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  // Mask secrets in error messages
  const safeReason = typeof reason === 'string' 
    ? reason.replace(/private[_-]?key|token|secret|password/gi, '***MASKED***')
    : reason;
  
  console.error('[Unhandled Rejection]', {
    reason: safeReason,
    timestamp: new Date().toISOString(),
  });
  
  // Don't exit - log and continue
  // In production, you might want to restart gracefully, but don't crash immediately
  if (NODE_ENV === 'production') {
    console.error('[Unhandled Rejection] In production - consider graceful restart');
  }
});

process.on('uncaughtException', (error: Error) => {
  // Mask secrets in error messages
  const safeMessage = error.message.replace(/private[_-]?key|token|secret|password/gi, '***MASKED***');
  
  console.error('[Uncaught Exception]', {
    message: safeMessage,
    name: error.name,
    timestamp: new Date().toISOString(),
  });
  
  // Don't exit immediately - log and try to continue
  // Only exit for critical errors that prevent the server from functioning
  if (error.message.includes('EADDRINUSE') || error.message.includes('port')) {
    console.error('[Uncaught Exception] Port conflict - must exit');
    process.exit(1);
  }
  
  if (NODE_ENV === 'production') {
    console.error('[Uncaught Exception] In production - consider graceful restart');
    // In production, you might want to restart, but don't crash immediately
    // Consider using a process manager (PM2, systemd) that will restart on exit
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${NODE_ENV}`);
  console.log(`📊 Log level: ${process.env.LOG_LEVEL || 'info'}`);
});
