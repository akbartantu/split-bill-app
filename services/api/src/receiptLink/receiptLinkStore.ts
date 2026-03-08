/**
 * In-memory store for receipt deep-link data. Token expires after TTL_MS.
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ReceiptLinkItem {
  name: string;
  totalPrice: number;
  quantity?: number;
}

export interface ReceiptLinkData {
  receiptName: string;
  items: ReceiptLinkItem[];
  total: number;
  currency?: string;
  createdAt: number;
}

const store = new Map<string, ReceiptLinkData>();

function generateToken(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function createReceiptLink(data: Omit<ReceiptLinkData, 'createdAt'>): string {
  const token = generateToken();
  store.set(token, { ...data, createdAt: Date.now() });
  return token;
}

export function getReceiptLink(token: string): ReceiptLinkData | null {
  const entry = store.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(token);
    return null;
  }
  return entry;
}
