/**
 * Telegram webhook: receive updates, handle photo → receipt scan → reply.
 */

import { Request, Response } from 'express';
import { getTelegramFile, downloadTelegramFile, sendTelegramMessage } from '../telegram/telegramBot.js';
import { processReceiptUpload } from '../receipt/service/receiptService.js';
import { GoogleSheetsClient } from '../clients/GoogleSheetsClient.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function getSheetsClient(): Promise<GoogleSheetsClient | undefined> {
  try {
    const spreadsheetId = process.env.SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID;
    let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
      const fs = await import('fs');
      const path = await import('path');
      const keyData = JSON.parse(fs.readFileSync(path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE), 'utf-8'));
      email = keyData.client_email;
      key = keyData.private_key;
    }
    if (!spreadsheetId || !email || !key) return undefined;
    return new GoogleSheetsClient(spreadsheetId, email, key);
  } catch {
    return undefined;
  }
}

export async function handleTelegramWebhook(req: Request, res: Response): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === '') {
    res.status(501).json({ ok: false, message: 'Telegram bot not configured' });
    return;
  }

  res.status(200).send(); // acknowledge immediately so Telegram doesn't retry

  const update = req.body as {
    message?: {
      chat: { id: number };
      text?: string;
      photo?: { file_id: string; file_size?: number; width: number; height: number }[];
    };
  };

  const message = update?.message;
  if (!message?.chat) return;

  const chatId = message.chat.id;

  try {
    if (message.photo && message.photo.length > 0) {
      const largest = message.photo[message.photo.length - 1];
      const { file_path } = await getTelegramFile(TELEGRAM_BOT_TOKEN, largest.file_id);
      const buffer = await downloadTelegramFile(TELEGRAM_BOT_TOKEN, file_path);
      const mimetype = 'image/jpeg';
      const sheetsClient = await getSheetsClient();
      const result = await processReceiptUpload(buffer, mimetype, undefined, sheetsClient, `tg_${chatId}`);

      const items = result.receipt?.items ?? [];
      const total = items.reduce((sum: number, i: { totalPrice?: number }) => sum + (i.totalPrice ?? 0), 0);
      const lines = items.slice(0, 15).map((i: { name?: string; totalPrice?: number }) => {
        const amt = i.totalPrice ?? 0;
        return `• ${i.name ?? 'Item'}: $${amt.toFixed(2)}`;
      });
      const text = result.success
        ? `✅ Receipt scanned.\nTotal: $${(total || 0).toFixed(2)}\n\n${lines.join('\n')}${items.length > 15 ? '\n...' : ''}`
        : `⚠️ Scan had issues. ${result.message ?? 'Please try again.'}`;
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, text);
      return;
    }

    if (message.text) {
      const t = message.text.trim().toLowerCase();
      if (t === '/start' || t === '/help') {
        await sendTelegramMessage(
          TELEGRAM_BOT_TOKEN,
          chatId,
          'Send me a photo of a receipt to scan it. I’ll reply with the items and total.\n\nCommands: /start, /help'
        );
      }
    }
  } catch (err: any) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.warn('[Telegram]', err?.message);
    }
    try {
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 'Sorry, something went wrong. Try again or use the web app.');
    } catch {
      // ignore
    }
  }
}
