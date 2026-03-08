/**
 * Telegram webhook + polling: receive updates, handle photo → receipt scan → reply.
 * After scan: offer "Continue in bot" or "Open in website". In-bot flow: names → assign items → who paid → result.
 */

import { Request, Response } from 'express';
import {
  getTelegramFile,
  downloadTelegramFile,
  sendTelegramMessage,
  sendTelegramMessageWithInlineKeyboard,
  answerCallbackQuery,
  getTelegramUpdates,
  deleteTelegramWebhook,
  type TelegramUpdate,
} from '../telegram/telegramBot.js';
import { getState, setState, clearState, type ReceiptSnapshot } from '../telegram/conversationState.js';
import { calculateBotSplit } from '../telegram/splitCalculator.js';
import { createReceiptLink } from '../receiptLink/receiptLinkStore.js';
import { processReceiptUpload } from '../receipt/service/receiptService.js';
import { GoogleSheetsClient } from '../clients/GoogleSheetsClient.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const POLLING_TIMEOUT = 30;
const APP_BASE_URL = process.env.APP_BASE_URL || process.env.VITE_APP_URL || 'http://localhost:8080';

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

async function handleCallbackQuery(chatId: number, data: string, botToken: string): Promise<boolean> {
  const state = getState(chatId);
  if (data === 'open_website' && state?.step === 'choose' && state.receipt) {
    const token = createReceiptLink({
      receiptName: 'Receipt',
      items: state.receipt.items.map((i) => ({ name: i.name, totalPrice: i.totalPrice })),
      total: state.receipt.total,
      currency: 'USD',
    });
    const url = `${APP_BASE_URL.replace(/\/$/, '')}/split?t=${token}`;
    await sendTelegramMessage(botToken, chatId, `Open this link to assign items and split on the website:\n\n${url}`);
    clearState(chatId);
    return true;
  }
  if (data === 'continue_bot' && state?.step === 'choose' && state.receipt) {
    setState(chatId, { ...state, step: 'participants' });
    await sendTelegramMessage(botToken, chatId, 'Send the names of people splitting, comma-separated.\nExample: Alice, Bob, Charlie');
    return true;
  }
  return false;
}

async function handleMessageWithState(chatId: number, text: string, botToken: string): Promise<boolean> {
  const state = getState(chatId);
  if (!state || state.step === 'choose') return false;

  if (state.step === 'participants') {
    const names = text.split(',').map((n) => n.trim()).filter(Boolean);
    if (names.length < 2) {
      await sendTelegramMessage(botToken, chatId, 'Please send at least 2 names, comma-separated.');
      return true;
    }
    const participants = names.map((name, i) => ({ id: `p${i}`, name }));
    setState(chatId, { ...state, step: 'assign', participants, assignItemIndex: 0, assignments: [] });
    const item = state.receipt.items[0];
    await sendTelegramMessage(botToken, chatId, `Who had "${item.name}" ($${item.totalPrice.toFixed(2)})?\nReply with names comma-separated, or "split" for equal split.`);
    return true;
  }

  if (state.step === 'assign' && state.participants != null && state.assignItemIndex != null) {
    const idx = state.assignItemIndex;
    const item = state.receipt.items[idx];
    const parts = text.trim().toLowerCase() === 'split' ? state.participants.map((p) => p.name) : text.split(',').map((n) => n.trim()).filter(Boolean);
    const participantIds = parts.map((name) => state.participants!.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id).filter(Boolean) as string[];
    const assignees = participantIds.length > 0 ? participantIds : state.participants.map((p) => p.id);
    const nextAssignments = [...(state.assignments || [])];
    nextAssignments[idx] = { participantIds: assignees };

    if (idx + 1 >= state.receipt.items.length) {
      setState(chatId, { ...state, step: 'who_paid', assignments: nextAssignments });
      await sendTelegramMessage(botToken, chatId, `Who paid the receipt? Reply with one name:\n${state.participants.map((p) => p.name).join(', ')}`);
    } else {
      const nextItem = state.receipt.items[idx + 1];
      setState(chatId, { ...state, assignItemIndex: idx + 1, assignments: nextAssignments });
      await sendTelegramMessage(botToken, chatId, `Who had "${nextItem.name}" ($${nextItem.totalPrice.toFixed(2)})?\nNames or "split".`);
    }
    return true;
  }

  if (state.step === 'who_paid' && state.participants) {
    const payer = state.participants.find((p) => p.name.toLowerCase() === text.trim().toLowerCase());
    if (!payer) {
      await sendTelegramMessage(botToken, chatId, 'Reply with one of: ' + state.participants.map((p) => p.name).join(', '));
      return true;
    }
    const totalPaidMinor = Math.round(state.receipt.total * 100);
    const result = calculateBotSplit({
      participants: state.participants,
      items: state.receipt.items.map((i) => ({ totalPrice: i.totalPrice })),
      assignments: state.assignments || state.receipt.items.map(() => ({ participantIds: state.participants!.map((p) => p.id) })),
      payerId: payer.id,
      totalPaidMinor,
    });
    const lines = result.transfers.map((t) => {
      const from = state.participants!.find((p) => p.id === t.fromId)?.name ?? t.fromId;
      const to = state.participants!.find((p) => p.id === t.toId)?.name ?? t.toId;
      return `${from} pays ${to}: $${(t.amountMinor / 100).toFixed(2)}`;
    });
    await sendTelegramMessage(botToken, chatId, `✅ Split result:\n\n${lines.join('\n')}`);
    clearState(chatId);
    return true;
  }
  return false;
}

/**
 * Process a single Telegram update (shared by webhook and polling).
 */
export async function processTelegramUpdate(update: TelegramUpdate, botToken: string): Promise<void> {
  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      await answerCallbackQuery(botToken, cq.id);
      const chatId = cq.message?.chat?.id;
      if (chatId != null && cq.data) {
        const handled = await handleCallbackQuery(chatId, cq.data, botToken);
        if (handled) return;
      }
    }

    const message = update?.message;
    if (!message?.chat) return;

    const chatId = message.chat.id;

    if (message.text) {
      const handled = await handleMessageWithState(chatId, message.text, botToken);
      if (handled) return;
      const t = message.text.trim().toLowerCase();
      if (t === '/start' || t === '/help') {
        await sendTelegramMessage(botToken, chatId, 'Send a photo of a receipt to scan. Then choose "Continue in bot" or "Open in website".\n\nCommands: /start, /help');
        return;
      }
    }

    if (message.photo && message.photo.length > 0) {
      const largest = message.photo[message.photo.length - 1];
      const { file_path } = await getTelegramFile(botToken, largest.file_id);
      const buffer = await downloadTelegramFile(botToken, file_path);
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

      if (result.success && items.length > 0) {
        const receiptSnapshot: ReceiptSnapshot = {
          items: items.map((i: { name?: string; totalPrice?: number }) => ({ name: i.name ?? 'Item', totalPrice: i.totalPrice ?? 0 })),
          total: total || 0,
        };
        setState(chatId, { step: 'choose', receipt: receiptSnapshot });
        await sendTelegramMessageWithInlineKeyboard(botToken, chatId, text, [
          { text: 'Continue in bot', callback_data: 'continue_bot' },
          { text: 'Open in website', callback_data: 'open_website' },
        ]);
      } else {
        await sendTelegramMessage(botToken, chatId, text);
      }
    }
  } catch (err: any) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.warn('[Telegram]', err?.message);
    }
    try {
      const chatId = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;
      if (chatId != null) {
        await sendTelegramMessage(botToken, chatId, 'Sorry, something went wrong. Try again or use the web app.');
      }
    } catch {
      // ignore
    }
  }
}

export async function handleTelegramWebhook(req: Request, res: Response): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === '') {
    res.status(501).json({ ok: false, message: 'Telegram bot not configured' });
    return;
  }

  res.status(200).send(); // acknowledge immediately so Telegram doesn't retry

  const update = req.body as TelegramUpdate;
  await processTelegramUpdate(update, TELEGRAM_BOT_TOKEN);
}

/**
 * Long-poll for updates (for local testing without webhook/tunnel).
 * Call when TELEGRAM_USE_POLLING=true. Run after server starts.
 */
export function startTelegramPolling(): void {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.trim() === '') {
    console.warn('[Telegram] TELEGRAM_USE_POLLING is set but TELEGRAM_BOT_TOKEN is missing. Polling disabled.');
    return;
  }

  let offset: number | undefined;

  const poll = async () => {
    try {
      const updates = await getTelegramUpdates(TELEGRAM_BOT_TOKEN, {
        offset,
        timeout: POLLING_TIMEOUT,
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        await processTelegramUpdate(update, TELEGRAM_BOT_TOKEN);
      }
    } catch (err: any) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.warn('[Telegram] Poll error:', err?.message);
      }
    }
    setImmediate(poll);
  };

  console.log('[Telegram] Polling enabled (local testing). Do not set a webhook.');
  deleteTelegramWebhook(TELEGRAM_BOT_TOKEN).then(
    () => {},
    (e) => { if (process.env.LOG_LEVEL === 'debug') console.warn('[Telegram] deleteWebhook:', e?.message); }
  );
  poll();
}
