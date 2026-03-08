/**
 * Telegram Bot API helpers: get file, download file, send message.
 */

const TELEGRAM_API = 'https://api.telegram.org';

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
  options?: { parse_mode?: 'HTML' | 'Markdown' }
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
