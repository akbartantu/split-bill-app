/**
 * Receipt link API: create token for deep link, retrieve by token.
 */

import { Request, Response } from 'express';
import { createReceiptLink, getReceiptLink } from '../receiptLink/receiptLinkStore.js';

const APP_BASE_URL = process.env.APP_BASE_URL || process.env.VITE_APP_URL || 'http://localhost:8080';

export async function postReceiptLink(req: Request, res: Response): Promise<void> {
  try {
    const { receiptName, items, total, currency } = req.body as {
      receiptName?: string;
      items?: { name: string; totalPrice: number; quantity?: number }[];
      total?: number;
      currency?: string;
    };
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ ok: false, message: 'items array required' });
      return;
    }
    const totalVal = typeof total === 'number' ? total : items.reduce((s, i) => s + (i.totalPrice ?? 0), 0);
    const token = createReceiptLink({
      receiptName: receiptName || 'Receipt',
      items: items.map((i) => ({ name: i.name || 'Item', totalPrice: i.totalPrice ?? 0, quantity: i.quantity ?? 1 })),
      total: totalVal,
      currency: currency || 'USD',
    });
    const url = `${APP_BASE_URL.replace(/\/$/, '')}/split?t=${token}`;
    res.json({ ok: true, token, url });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message || 'Failed to create link' });
  }
}

export async function getReceiptLinkByToken(req: Request, res: Response): Promise<void> {
  const token = req.params.token as string;
  if (!token) {
    res.status(400).json({ ok: false, message: 'token required' });
    return;
  }
  const data = getReceiptLink(token);
  if (!data) {
    res.status(404).json({ ok: false, message: 'Link expired or not found' });
    return;
  }
  res.json({ ok: true, data });
}
