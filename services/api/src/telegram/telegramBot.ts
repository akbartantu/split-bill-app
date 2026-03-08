/**
 * Telegram Bot API helpers: get file, download file, send message, getUpdates (for polling).
 */

const TELEGRAM_API = 'https://api.telegram.org';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    photo?: { file_id: string; file_size?: number; width: number; height: number }[];
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
  };
}

/** Remove webhook so updates are delivered via getUpdates (for polling). */
export async function deleteTelegramWebhook(botToken: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/deleteWebhook`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram deleteWebhook failed');
}

export async function getTelegramUpdates(
  botToken: string,
  options?: { offset?: number; timeout?: number }
): Promise<TelegramUpdate[]> {
  const params = new URLSearchParams();
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.timeout != null) params.set('timeout', String(options.timeout));
  const qs = params.toString();
  const url = `${TELEGRAM_API}/bot${botToken}/getUpdates${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram getUpdates failed');
  return data.result ?? [];
}

export async function getTelegramFile(botToken: string, fileId: string): Promise<{ file_path: string }> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram getFile failed');
  return { file_path: data.result.file_path };
}

export async function downloadTelegramFile(botToken: string, filePath: string): Promise<Buffer> {
  const url = `${TELEGRAM_API}/file/bot${botToken}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  options?: { parse_mode?: 'HTML' | 'Markdown'; reply_markup?: unknown }
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text, ...options };
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram sendMessage failed');
}

/** Inline keyboard: one row of buttons with callback_data. */
export async function sendTelegramMessageWithInlineKeyboard(
  botToken: string,
  chatId: number,
  text: string,
  buttons: { text: string; callback_data: string }[]
): Promise<void> {
  const reply_markup = {
    inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.callback_data }))],
  };
  await sendTelegramMessage(botToken, chatId, text, { reply_markup });
}

export async function answerCallbackQuery(botToken: string, callbackQueryId: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram answerCallbackQuery failed');
}
