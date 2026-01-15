import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Bill, BillItem, Participant, Adjustment, Payment, Receipt, ReceiptExtraType, ReceiptExtras, PaymentMethod } from '@/types/bill';
import { PARTICIPANT_COLORS, DEFAULT_ADJUSTMENTS } from '@/types/bill';
import { toMinor } from '@/lib/money';
import { getCurrencyConfig } from '@/lib/currency';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function buildDefaultReceipt(index: number = 1): Receipt {
  return {
    id: generateId(),
    receiptName: `Receipt ${index}`,
    createdAt: new Date(),
  };
}

function buildDefaultReceiptExtras(): ReceiptExtras {
  return {
    tax: { mode: 'percentage', value: 0, isInclusive: false },
    service: { mode: 'percentage', value: 0, isInclusive: false },
    tip: { mode: 'percentage', value: 0, isInclusive: false },
  };
}

function normalizeBillReceipts(bill: Bill): Bill {
  const receipts = bill.receipts && bill.receipts.length > 0 ? bill.receipts : [];
  let normalizedReceipts = receipts.map((receipt, index) => ({
    ...receipt,
    receiptName: receipt.receiptName || receipt.merchantName || `Receipt ${index + 1}`,
  }));
  let normalizedItems = bill.items;
  let normalizedPayments = bill.payments || [];
  const extrasById = bill.receiptExtrasById ? { ...bill.receiptExtrasById } : {};
  const currencyCode = bill.currencyCode || bill.currency || 'USD';
  const currencyConfig = getCurrencyConfig(currencyCode);

  const hasMissingReceiptId = bill.items.some(item => !item.receiptId);
  if ((receipts.length === 0 && bill.items.length > 0) || hasMissingReceiptId) {
    const defaultReceipt = buildDefaultReceipt(1);
    normalizedReceipts = receipts.length > 0 ? receipts : [defaultReceipt];
    const receiptId = normalizedReceipts[0].id;
    normalizedItems = bill.items.map(item =>
      item.receiptId ? item : { ...item, receiptId }
    );
  }

  normalizedReceipts.forEach(receipt => {
    if (!extrasById[receipt.id]) {
      extrasById[receipt.id] = buildDefaultReceiptExtras();
    }
  });

  Object.keys(extrasById).forEach(receiptId => {
    const extras = extrasById[receiptId];
    (['tax', 'service', 'tip'] as const).forEach(type => {
      const extra = extras[type];
      if (extra.mode === 'fixed' && !Number.isInteger(extra.value)) {
        extras[type] = {
          ...extra,
          value: toMinor(extra.value, currencyCode),
        };
      }
    });
  });

  normalizedItems = normalizedItems.map(item => {
    const unitPriceMinor = typeof item.unitPriceMinor === 'number'
      ? item.unitPriceMinor
      : toMinor(item.unitPrice || 0, currencyCode);
    const lineTotalMinor = typeof item.lineTotalMinor === 'number'
      ? item.lineTotalMinor
      : unitPriceMinor * item.quantity;
    return {
      ...item,
      unitPriceMinor,
      lineTotalMinor,
    };
  });

  normalizedPayments = normalizedPayments.map(payment => {
    const receiptId = payment.receiptId || (normalizedReceipts[0]?.id ?? buildDefaultReceipt(1).id);
    const amountMinor = typeof payment.amountMinor === 'number'
      ? payment.amountMinor
      : typeof payment.amountCents === 'number'
        ? payment.amountCents
        : toMinor(payment.amount || 0, currencyCode);
    return {
      ...payment,
      receiptId,
      amountMinor,
    };
  });

  return {
    ...bill,
    currencyCode,
    currencyLocale: bill.currencyLocale || currencyConfig.locale,
    currencySymbol: bill.currencySymbol || currencyConfig.symbol,
    currency: bill.currency || currencyCode,
    receipts: normalizedReceipts,
    items: normalizedItems,
    payments: normalizedPayments,
    receiptExtrasById: extrasById,
  };
}

function createNewBill(): Bill {
  const currencyCode = 'USD';
  const currencyConfig = getCurrencyConfig(currencyCode);
  return {
    id: generateId(),
    name: '',
    createdAt: new Date(),
    currencyCode,
    currencyLocale: currencyConfig.locale,
    currencySymbol: currencyConfig.symbol,
    currency: currencyCode,
    participants: [],
    items: [],
    adjustments: DEFAULT_ADJUSTMENTS.map(adj => ({
      ...adj,
      id: generateId(),
    })) as Adjustment[],
    payments: [],
    receipts: [], // Initialize receipts array
    receiptExtrasById: {},
  };
}

interface BillState {
  currentBill: Bill;
  recentBills: Bill[];
  step: 'participants' | 'items' | 'adjustments' | 'summary';
  
  // Bill actions
  resetBill: () => void;
  setBillName: (name: string) => void;
  setCurrency: (currency: string, symbol: string) => void;
  setCurrencyCode: (code: string, locale?: string) => void;
  
  // Step navigation
  setStep: (step: BillState['step']) => void;
  nextStep: () => void;
  prevStep: () => void;
  
  // Participant actions
  addParticipant: (name: string) => void;
  removeParticipant: (id: string) => void;
  updateParticipant: (id: string, updates: Partial<Participant>) => void;
  
  // Item actions
  addItem: (item: Omit<BillItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<BillItem>) => void;
  assignItemToParticipant: (itemId: string, participantId: string, shareCount?: number) => void;
  unassignItemFromParticipant: (itemId: string, participantId: string) => void;
  toggleItemShared: (itemId: string) => void;
  
  // Receipt actions
  addReceipt: (receipt: Omit<import('@/types/bill').Receipt, 'id'>) => string; // Returns receipt ID
  updateReceipt: (id: string, updates: Partial<import('@/types/bill').Receipt>) => void;
  removeReceipt: (id: string) => void;
  updateReceiptExtra: (receiptId: string, type: ReceiptExtraType, updates: Partial<ReceiptExtras[ReceiptExtraType]>) => void;
  
  // Adjustment actions
  updateAdjustment: (id: string, updates: Partial<Adjustment>) => void;
  addCustomAdjustment: (adjustment: Omit<Adjustment, 'id'>) => void;
  removeAdjustment: (id: string) => void;
  
  // Payment actions
  addPayment: (payerId: string, amount: number, receiptId?: string, method?: PaymentMethod, note?: string) => void;
  addPaymentRecord: (payment: Omit<Payment, 'id'>) => void;
  updatePayment: (id: string, updates: Partial<Payment>) => void;
  removePayment: (id: string) => void;
  
  // Save to history
  saveBillToHistory: () => void;
  loadBill: (bill: Bill) => void;
  deleteBillFromHistory: (id: string) => void;
}

export const useBillStore = create<BillState>()(
  persist(
    (set, get) => ({
      currentBill: createNewBill(),
      recentBills: [],
      step: 'participants',

      resetBill: () => set({ 
        currentBill: createNewBill(),
        step: 'participants',
      }),

      setBillName: (name) => set(state => ({
        currentBill: { ...state.currentBill, name },
      })),

      setCurrency: (currency, symbol) => set(state => ({
        currentBill: { 
          ...state.currentBill, 
          currency, 
          currencySymbol: symbol,
          currencyCode: currency,
          currencyLocale: getCurrencyConfig(currency).locale,
        },
      })),

      setCurrencyCode: (code, locale) => set(state => ({
        currentBill: { 
          ...state.currentBill, 
          currencyCode: code, 
          currencyLocale: locale || getCurrencyConfig(code).locale,
          currencySymbol: getCurrencyConfig(code).symbol,
        },
      })),

  setStep: (step) => set({ step: step === 'adjustments' ? 'items' : step }),

      nextStep: () => set(state => {
        const steps: BillState['step'][] = ['participants', 'items', 'summary'];
        const currentIndex = steps.indexOf(state.step);
        const nextIndex = Math.min(currentIndex + 1, steps.length - 1);
        return { step: steps[nextIndex] };
      }),

      prevStep: () => set(state => {
        const steps: BillState['step'][] = ['participants', 'items', 'summary'];
        const currentIndex = steps.indexOf(state.step);
        const prevIndex = Math.max(currentIndex - 1, 0);
        return { step: steps[prevIndex] };
      }),

      addParticipant: (name) => set(state => {
        const usedColors = state.currentBill.participants.map(p => p.color);
        const availableColor = PARTICIPANT_COLORS.find(c => !usedColors.includes(c)) 
          || PARTICIPANT_COLORS[state.currentBill.participants.length % PARTICIPANT_COLORS.length];
        
        return {
          currentBill: {
            ...state.currentBill,
            participants: [
              ...state.currentBill.participants,
              {
                id: generateId(),
                name,
                color: availableColor,
              },
            ],
          },
        };
      }),

      removeParticipant: (id) => set(state => ({
        currentBill: {
          ...state.currentBill,
          participants: state.currentBill.participants.filter(p => p.id !== id),
          items: state.currentBill.items.map(item => ({
            ...item,
            assignees: item.assignees.filter(a => a.participantId !== id),
          })),
          payments: state.currentBill.payments.filter(p => p.payerId !== id),
        },
      })),

      updateParticipant: (id, updates) => set(state => ({
        currentBill: {
          ...state.currentBill,
          participants: state.currentBill.participants.map(p =>
            p.id === id ? { ...p, ...updates } : p
          ),
        },
      })),

      addItem: (item) => set(state => {
        let receipts = state.currentBill.receipts || [];
        let receiptId = item.receiptId;
        if (!receiptId) {
          if (receipts.length === 0) {
            const defaultReceipt = buildDefaultReceipt(1);
            receipts = [defaultReceipt];
            receiptId = defaultReceipt.id;
          } else {
            receiptId = receipts[0].id;
          }
        }
        const currencyCode = state.currentBill.currencyCode || state.currentBill.currency || 'USD';
        const unitPriceMinor = typeof item.unitPriceMinor === 'number'
          ? item.unitPriceMinor
          : toMinor(item.unitPrice || 0, currencyCode);
        const lineTotalMinor = typeof item.lineTotalMinor === 'number'
          ? item.lineTotalMinor
          : unitPriceMinor * item.quantity;
        return {
          currentBill: {
            ...state.currentBill,
            receipts,
            items: [
              ...state.currentBill.items,
              { ...item, id: generateId(), receiptId, unitPriceMinor, lineTotalMinor },
            ],
          },
        };
      }),

      removeItem: (id) => set(state => ({
        currentBill: {
          ...state.currentBill,
          items: state.currentBill.items.filter(i => i.id !== id),
        },
      })),

      updateItem: (id, updates) => set(state => ({
        currentBill: {
          ...state.currentBill,
          items: state.currentBill.items.map(i => {
            if (i.id !== id) return i;
            const next = { ...i, ...updates };
            if ((updates.quantity || updates.unitPriceMinor) && typeof updates.lineTotalMinor !== 'number') {
              next.lineTotalMinor = next.unitPriceMinor * next.quantity;
            }
            return next;
          }),
        },
      })),

      assignItemToParticipant: (itemId, participantId, shareCount = 1) => set(state => ({
        currentBill: {
          ...state.currentBill,
          items: state.currentBill.items.map(item => {
            if (item.id !== itemId) return item;
            
            const existing = item.assignees.find(a => a.participantId === participantId);
            if (existing) {
              return {
                ...item,
                assignees: item.assignees.map(a =>
                  a.participantId === participantId
                    ? { ...a, shareCount }
                    : a
                ),
              };
            }
            
            return {
              ...item,
              assignees: [...item.assignees, { participantId, shareCount }],
            };
          }),
        },
      })),

      unassignItemFromParticipant: (itemId, participantId) => set(state => ({
        currentBill: {
          ...state.currentBill,
          items: state.currentBill.items.map(item => {
            if (item.id !== itemId) return item;
            return {
              ...item,
              assignees: item.assignees.filter(a => a.participantId !== participantId),
            };
          }),
        },
      })),

      toggleItemShared: (itemId) => set(state => ({
        currentBill: {
          ...state.currentBill,
          items: state.currentBill.items.map(item =>
            item.id === itemId ? { ...item, isShared: !item.isShared } : item
          ),
        },
      })),

      updateAdjustment: (id, updates) => set(state => ({
        currentBill: {
          ...state.currentBill,
          adjustments: state.currentBill.adjustments.map(a =>
            a.id === id ? { ...a, ...updates } : a
          ),
        },
      })),

      addCustomAdjustment: (adjustment) => set(state => ({
        currentBill: {
          ...state.currentBill,
          adjustments: [
            ...state.currentBill.adjustments,
            { ...adjustment, id: generateId() },
          ],
        },
      })),

      removeAdjustment: (id) => set(state => ({
        currentBill: {
          ...state.currentBill,
          adjustments: state.currentBill.adjustments.filter(a => a.id !== id),
        },
      })),

      addPayment: (payerId, amount, receiptId, method, note) => set(state => {
        let receipts = state.currentBill.receipts || [];
        let finalReceiptId = receiptId;
        if (!finalReceiptId) {
          if (receipts.length === 0) {
            const defaultReceipt = buildDefaultReceipt(1);
            receipts = [defaultReceipt];
            finalReceiptId = defaultReceipt.id;
          } else {
            finalReceiptId = receipts[0].id;
          }
        }
        const currencyCode = state.currentBill.currencyCode || state.currentBill.currency || 'USD';
        return {
          currentBill: {
            ...state.currentBill,
            receipts,
            payments: [
              ...state.currentBill.payments,
              {
                id: generateId(),
                payerId,
                receiptId: finalReceiptId!,
                amountMinor: toMinor(amount, currencyCode),
                method,
                note,
                createdAt: new Date(),
              },
            ],
          },
        };
      }),

      addPaymentRecord: (payment) => set(state => ({
        currentBill: {
          ...state.currentBill,
          payments: [
            ...state.currentBill.payments,
            { ...payment, id: generateId() },
          ],
        },
      })),

      updatePayment: (id, updates) => set(state => ({
        currentBill: {
          ...state.currentBill,
          payments: state.currentBill.payments.map(p =>
            p.id === id ? { ...p, ...updates } : p
          ),
        },
      })),

      removePayment: (id) => set(state => ({
        currentBill: {
          ...state.currentBill,
          payments: state.currentBill.payments.filter(p => p.id !== id),
        },
      })),

      saveBillToHistory: () => set(state => {
        const billToSave = {
          ...state.currentBill,
          createdAt: new Date(),
        };
        
        return {
          recentBills: [billToSave, ...state.recentBills.slice(0, 9)],
        };
      }),

      loadBill: (bill) => set({
        currentBill: normalizeBillReceipts({ ...bill, createdAt: new Date(bill.createdAt) }),
        step: 'summary',
      }),

      deleteBillFromHistory: (id) => set(state => ({
        recentBills: state.recentBills.filter(b => b.id !== id),
      })),

      addReceipt: (receipt) => {
        const receiptId = generateId();
        const receiptName = receipt.receiptName || receipt.merchantName || `Receipt ${(get().currentBill.receipts?.length || 0) + 1}`;
        set(state => ({
          currentBill: {
            ...state.currentBill,
            receipts: [
              ...(state.currentBill.receipts || []),
              { ...receipt, id: receiptId, receiptName, createdAt: receipt.createdAt || new Date() },
            ],
            receiptExtrasById: {
              ...(state.currentBill.receiptExtrasById || {}),
              [receiptId]: buildDefaultReceiptExtras(),
            },
          },
        }));
        return receiptId;
      },

      updateReceipt: (id, updates) => set(state => ({
        currentBill: {
          ...state.currentBill,
          receipts: (state.currentBill.receipts || []).map(r =>
            r.id === id ? { ...r, ...updates } : r
          ),
        },
      })),

      removeReceipt: (id) => set(state => {
        const remainingReceipts = (state.currentBill.receipts || []).filter(r => r.id !== id);
        let receipts = remainingReceipts;
        if (receipts.length === 0) {
          receipts = [buildDefaultReceipt(1)];
        }
        const fallbackReceiptId = receipts[0].id;
        const extrasById = { ...(state.currentBill.receiptExtrasById || {}) };
        delete extrasById[id];
        receipts.forEach(receipt => {
          if (!extrasById[receipt.id]) {
            extrasById[receipt.id] = buildDefaultReceiptExtras();
          }
        });
        return {
          currentBill: {
            ...state.currentBill,
            receipts,
            items: state.currentBill.items.map(item =>
              item.receiptId === id ? { ...item, receiptId: fallbackReceiptId } : item
            ),
            payments: state.currentBill.payments.map(payment =>
              payment.receiptId === id ? { ...payment, receiptId: fallbackReceiptId } : payment
            ),
            receiptExtrasById: extrasById,
          },
        };
      }),

      updateReceiptExtra: (receiptId, type, updates) => set(state => ({
        currentBill: {
          ...state.currentBill,
          receiptExtrasById: {
            ...(state.currentBill.receiptExtrasById || {}),
            [receiptId]: {
              ...(state.currentBill.receiptExtrasById?.[receiptId] || buildDefaultReceiptExtras()),
              [type]: {
                ...(state.currentBill.receiptExtrasById?.[receiptId]?.[type] || buildDefaultReceiptExtras()[type]),
                ...updates,
              },
            },
          },
        },
      })),
    }),
    {
      name: 'billsplit-storage',
      partialize: (state) => ({ recentBills: state.recentBills }),
    }
  )
);
