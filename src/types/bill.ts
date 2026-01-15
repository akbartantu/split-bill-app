// Core domain types for BillSplit Pro

export interface Participant {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

export interface ItemAssignment {
  participantId: string;
  shareCount: number;
}

export interface BillItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  assignees: ItemAssignment[];
  isShared: boolean;
  receiptId: string; // Reference to receipt this item came from (required)
  needsReview?: boolean;
  // Legacy support
  unitPrice?: number;
  lineTotal?: number;
}

export interface Adjustment {
  id: string;
  type: 'tax' | 'service' | 'tip' | 'discount';
  name: string;
  mode: 'percentage' | 'fixed';
  value: number;
  isInclusive: boolean;
}

export type ReceiptExtraType = 'tax' | 'service' | 'tip';

export interface ReceiptExtra {
  mode: 'percentage' | 'fixed';
  value: number; // percentage value or minor units when mode=fixed
  isInclusive: boolean;
}

export type ReceiptExtras = Record<ReceiptExtraType, ReceiptExtra>;

export type PaymentMethod = 'card' | 'cash' | 'transfer';

export interface Payment {
  id: string;
  receiptId: string;
  payerId: string;
  amountMinor: number;
  method?: PaymentMethod;
  note?: string;
  createdAt?: Date;
  // Legacy support
  amount?: number;
  amountCents?: number;
}

export interface Receipt {
  id: string;
  receiptName: string;
  merchantName?: string;
  location?: string;
  date?: string;
  receiptNumber?: string;
  createdAt?: Date;
  payerPersonId?: string | null;
  paidAmountMinor?: number | null;
}

export interface Bill {
  id: string;
  name: string;
  createdAt: Date;
  currencyCode: string;
  currencyLocale?: string;
  participants: Participant[];
  items: BillItem[];
  adjustments: Adjustment[];
  payments: Payment[];
  receipts?: Receipt[]; // Receipts associated with this bill
  receiptExtrasById?: Record<string, ReceiptExtras>;
  // Legacy support
  currency?: string;
  currencySymbol?: string;
}

export interface ReceiptGroup {
  receiptId: string;
  receiptLabel: string; // merchant_name or "Receipt 2"
  receiptDate?: string;
  items: Array<{
    itemId: string;
    itemName: string;
    allocatedAmount: number; // minor units
    quantity: number;
    unitPrice: number; // minor units
    lineTotal: number; // minor units
  }>;
  groupTotalAmount: number; // minor units
}

export interface PersonSummary {
  participantId: string;
  participantName: string;
  participantColor: string;
  itemsTotal: number; // minor units
  adjustmentsShare: number; // minor units
  grandTotal: number; // minor units
  amountPaid: number; // minor units
  netOwed: number; // minor units
  itemBreakdown: { itemName: string; amount: number }[]; // minor units
  receiptGroups?: ReceiptGroup[]; // New grouped structure
}

export interface Transfer {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export type SplitMode = 'equal' | 'itemized' | 'custom' | 'percentage';

// Participant colors palette
export const PARTICIPANT_COLORS = [
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];

export const DEFAULT_ADJUSTMENTS: Partial<Adjustment>[] = [
  { type: 'tax', name: 'Tax', mode: 'percentage', value: 0, isInclusive: false },
  { type: 'service', name: 'Service Charge', mode: 'percentage', value: 0, isInclusive: false },
  { type: 'tip', name: 'Tip', mode: 'percentage', value: 0, isInclusive: false },
];
