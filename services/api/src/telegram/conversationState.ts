/**
 * In-memory conversation state per chat for "Continue in bot" flow.
 */

export interface ScannedItem {
  name: string;
  totalPrice: number;
}

export interface ReceiptSnapshot {
  items: ScannedItem[];
  total: number;
}

export type BotStep =
  | 'choose'       // just scanned, waiting for button
  | 'participants' // waiting for names
  | 'assign'       // waiting for who had item N
  | 'who_paid'     // waiting for payer name
  | 'done';

export interface BotState {
  step: BotStep;
  receipt: ReceiptSnapshot;
  participants?: { id: string; name: string }[];
  assignItemIndex?: number;
  assignments?: { participantIds: string[] }[];
  payerId?: string;
}

const stateByChat = new Map<number, BotState>();

export function getState(chatId: number): BotState | undefined {
  return stateByChat.get(chatId);
}

export function setState(chatId: number, state: BotState): void {
  stateByChat.set(chatId, state);
}

export function clearState(chatId: number): void {
  stateByChat.delete(chatId);
}
