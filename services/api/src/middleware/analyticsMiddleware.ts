/**
 * Analytics Middleware
 *
 * Records a "visit" once per IP per day (server-side, no client exposure).
 * Skips health checks and admin so those don't inflate visitor counts.
 */

import { Request, Response, NextFunction } from 'express';
import { recordVisit } from '../analytics/analyticsService.js';

const SKIP_PATHS = ['/health', '/api/health', '/admin', '/internal/stats', '/webhooks/telegram'];

export function analyticsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path || '';
  if (SKIP_PATHS.some((p) => path === p || path.startsWith(p + '?'))) {
    return next();
  }

  // Fire-and-forget: don't block the response
  recordVisit(req).then(
    () => {},
    () => {}
  );

  next();
}
