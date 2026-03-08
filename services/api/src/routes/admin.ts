/**
 * Admin Routes
 *
 * Token-protected analytics view. Not linked from the app.
 * Use ?token=YOUR_ADMIN_TOKEN or header X-Admin-Token.
 */

import { Request, Response } from 'express';
import { readStats, type AnalyticsStats } from '../analytics/analyticsService.js';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ANALYTICS_TOKEN;

function isAuthorized(req: Request): boolean {
  if (!ADMIN_TOKEN || ADMIN_TOKEN.trim() === '') return false;
  const token =
    (req.query.token as string) ||
    req.get('X-Admin-Token') ||
    req.get('Authorization')?.replace(/^Bearer\s+/i, '');
  return token === ADMIN_TOKEN;
}

function htmlPage(stats: AnalyticsStats): string {
  const rows = stats.byDay
    .slice()
    .reverse()
    .map(
      (d) =>
        `<tr><td>${d.date}</td><td>${d.visitors}</td><td>${d.receiptUses}</td><td>${d.splitGenerated}</td></tr>`
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Analytics</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.25rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #eee; }
    th { color: #666; font-weight: 600; }
    .totals { margin-top: 1.5rem; padding: 1rem; background: #f5f5f5; border-radius: 8px; }
    .totals p { margin: 0.25rem 0; }
  </style>
</head>
<body>
  <h1>Analytics</h1>
  <div class="totals">
    <p><strong>Total visitors (unique IPs per day):</strong> ${stats.totalVisitors}</p>
    <p><strong>Total receipt uses:</strong> ${stats.totalReceiptUses}</p>
    <p><strong>Total split bills generated:</strong> ${stats.totalSplitGenerated}</p>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Visitors</th><th>Receipt uses</th><th>Split generated</th></tr></thead>
    <tbody>${rows.length ? rows : '<tr><td colspan="4">No data yet</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

export async function getAdminStats(req: Request, res: Response): Promise<void> {
  if (!isAuthorized(req)) {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'Invalid or missing token' });
    return;
  }

  try {
    const stats = await readStats();
    const accept = req.get('Accept') || '';
    const wantsHtml = req.query.format === 'html' || accept.includes('text/html');

    if (wantsHtml) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(htmlPage(stats));
    } else {
      res.json({ ok: true, ...stats });
    }
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'Failed to load analytics',
    });
  }
}
