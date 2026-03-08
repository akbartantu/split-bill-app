/**
 * Analytics Service
 *
 * Tracks visitors (unique per IP per day) and receipt usage.
 * Stores events in Google Sheet "Analytics"; deduplicates visits in-memory.
 * Fails silently if Sheet is not configured so the app keeps working.
 */

import crypto from 'crypto';
import { Request } from 'express';
import { GoogleSheetsClient } from '../clients/GoogleSheetsClient.js';

const ANALYTICS_SHEET_NAME = 'Analytics';
const HEADERS = ['Date', 'EventType', 'IpHash'];

/** In-memory set of "date:ipHash" we already recorded for visit (avoids duplicate rows per day) */
const visitKeysRecorded = new Set<string>();

/**
 * Get a Google Sheets client from env (same pattern as receipts). Returns undefined if not configured.
 */
async function getSheetsClient(): Promise<GoogleSheetsClient | undefined> {
  try {
    const spreadsheetId = process.env.SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID;
    let serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
      const fs = await import('fs');
      const path = await import('path');
      const keyFilePath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
      const keyData = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
      serviceAccountEmail = keyData.client_email;
      privateKey = keyData.private_key;
    }

    if (
      !spreadsheetId ||
      !serviceAccountEmail ||
      !privateKey ||
      spreadsheetId === 'replace_me' ||
      spreadsheetId.trim() === '' ||
      String(serviceAccountEmail).trim() === '' ||
      String(privateKey).trim() === ''
    ) {
      return undefined;
    }

    return new GoogleSheetsClient(spreadsheetId, serviceAccountEmail, privateKey);
  } catch {
    return undefined;
  }
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip || 'unknown').digest('hex').slice(0, 12);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ensure the Analytics sheet exists and has headers. Call before first append/read.
 */
async function ensureSheet(client: GoogleSheetsClient): Promise<void> {
  const exists = await client.sheetExists(ANALYTICS_SHEET_NAME);
  if (!exists) {
    await client.createSheet(ANALYTICS_SHEET_NAME);
  }
  const headers = await client.getHeaders(ANALYTICS_SHEET_NAME);
  if (headers.length === 0) {
    await client.setHeaders(ANALYTICS_SHEET_NAME, HEADERS);
  }
}

/**
 * Record a visit (one row per unique IP per day). Deduplicated in-memory.
 */
export async function recordVisit(req: Request): Promise<void> {
  try {
    const client = await getSheetsClient();
    if (!client) return;

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const ipHash = hashIp(ip);
    const date = today();
    const key = `${date}:${ipHash}`;

    if (visitKeysRecorded.has(key)) return;

    await ensureSheet(client);
    await client.appendRow(ANALYTICS_SHEET_NAME, [date, 'visit', ipHash]);
    visitKeysRecorded.add(key);
  } catch (err: any) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.warn('[Analytics] recordVisit failed:', err?.message);
    }
  }
}

/**
 * Record a receipt use (every scan/upload). Call from receipt handler on success.
 */
export async function recordReceiptUse(req: Request): Promise<void> {
  try {
    const client = await getSheetsClient();
    if (!client) return;

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const ipHash = hashIp(ip);
    const date = today();

    await ensureSheet(client);
    await client.appendRow(ANALYTICS_SHEET_NAME, [date, 'receipt_use', ipHash]);
  } catch (err: any) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.warn('[Analytics] recordReceiptUse failed:', err?.message);
    }
  }
}

export interface DailyStats {
  date: string;
  visitors: number;
  receiptUses: number;
}

export interface AnalyticsStats {
  byDay: DailyStats[];
  totalVisitors: number;
  totalReceiptUses: number;
}

/**
 * Read all events from the Analytics sheet and aggregate by day.
 */
export async function readStats(): Promise<AnalyticsStats> {
  const byDay: DailyStats[] = [];
  const visitorSetByDay = new Map<string, Set<string>>();
  const receiptCountByDay = new Map<string, number>();

  try {
    const client = await getSheetsClient();
    if (!client) {
      return { byDay: [], totalVisitors: 0, totalReceiptUses: 0 };
    }

    await ensureSheet(client);
    const rows = await client.readRows(ANALYTICS_SHEET_NAME);

    for (const row of rows) {
      const date = String(row[0] || '').trim();
      const eventType = String(row[1] || '').trim().toLowerCase();
      const ipHash = String(row[2] || '').trim();

      if (!date) continue;

      if (eventType === 'visit') {
        if (!visitorSetByDay.has(date)) visitorSetByDay.set(date, new Set());
        visitorSetByDay.get(date)!.add(ipHash || '?');
      } else if (eventType === 'receipt_use') {
        receiptCountByDay.set(date, (receiptCountByDay.get(date) || 0) + 1);
      }
    }

    const allDates = new Set([...visitorSetByDay.keys(), ...receiptCountByDay.keys()]);
    const sortedDates = Array.from(allDates).sort();

    let totalVisitors = 0;
    let totalReceiptUses = 0;

    for (const date of sortedDates) {
      const visitors = visitorSetByDay.get(date)?.size ?? 0;
      const receiptUses = receiptCountByDay.get(date) ?? 0;
      totalVisitors += visitors;
      totalReceiptUses += receiptUses;
      byDay.push({ date, visitors, receiptUses });
    }

    return { byDay, totalVisitors, totalReceiptUses };
  } catch (err: any) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.warn('[Analytics] readStats failed:', err?.message);
    }
    return { byDay: [], totalVisitors: 0, totalReceiptUses: 0 };
  }
}
