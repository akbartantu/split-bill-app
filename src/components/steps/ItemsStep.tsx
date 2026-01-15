import { useEffect, useMemo, useRef, useState } from 'react';
import { useBillStore } from '@/store/billStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, ArrowRight, ArrowLeft, Camera, Plus } from 'lucide-react';
import { EditReceiptItem, type EditableReceiptItem } from '@/components/EditReceiptItem';
import { Button } from '@/components/ui/button';
import { calculateReceiptExtrasTotal, calculateReceiptSubtotal, formatCurrency } from '@/lib/calculations';
import { ReceiptScanner } from '@/components/ReceiptScanner';
import type { ParsedReceipt } from '@/lib/ocr';
import { ReceiptCard } from '@/components/receipts/ReceiptCard';
import { ReceiptAccordionCard } from '@/components/receipts/ReceiptAccordionCard';
import { getReceiptStatuses } from '@/selectors/receiptStatus';
import { getDefaultExpandedReceiptIds } from '@/utils/receiptExpandDefaults';
import { toMinor, fromMinor } from '@/lib/money';

export function ItemsStep() {
  const { 
    currentBill, 
    addItem, 
    removeItem,
    updateItem,
    addReceipt,
    updateReceipt,
    removeReceipt,
    updateReceiptExtra,
    assignItemToParticipant,
    unassignItemFromParticipant,
    updateAdjustment,
    nextStep, 
    prevStep 
  } = useBillStore();
  
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanTargetReceiptId, setScanTargetReceiptId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<EditableReceiptItem | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showOnlyAttention, setShowOnlyAttention] = useState(false);
  const prevReceiptIdsKey = useRef<string>('');

  const createReceipt = (overrides?: { merchantName?: string; receiptName?: string; date?: string; location?: string }) => {
    const nextIndex = (currentBill.receipts?.length || 0) + 1;
    return addReceipt({
      receiptName: overrides?.receiptName || `Receipt ${nextIndex}`,
      merchantName: overrides?.merchantName,
      date: overrides?.date,
      location: overrides?.location,
      createdAt: new Date(),
    });
  };

  const handleAddItemToReceipt = (receiptId: string, item: { name: string; quantity: number; unitPriceMinor: number }) => {
    addItem({
      name: item.name,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.unitPriceMinor * item.quantity,
      quantity: item.quantity,
      assignees: [],
      isShared: false,
      receiptId,
    });
  };

  const toggleAssignment = (itemId: string, participantId: string) => {
    const item = currentBill.items.find(i => i.id === itemId);
    if (!item) return;
    
    const isAssigned = item.assignees.some(a => a.participantId === participantId);
    if (isAssigned) {
      unassignItemFromParticipant(itemId, participantId);
    } else {
      assignItemToParticipant(itemId, participantId);
    }
  };

  const handleScanComplete = (receipt: ParsedReceipt, targetReceiptId?: string | null) => {
    const currencyCode = currentBill.currencyCode || currentBill.currency || 'USD';
    let receiptId = targetReceiptId || '';
    const existingReceipt = targetReceiptId
      ? currentBill.receipts?.find(r => r.id === targetReceiptId)
      : undefined;

    if (existingReceipt) {
      const nextName = existingReceipt.receiptName?.startsWith('Receipt ') && receipt.merchant
        ? receipt.merchant
        : existingReceipt.receiptName;
      updateReceipt(existingReceipt.id, {
        merchantName: receipt.merchant || existingReceipt.merchantName,
        receiptName: nextName || existingReceipt.receiptName,
        date: receipt.date || existingReceipt.date,
      });
      receiptId = existingReceipt.id;
    } else {
      // Create new receipt with merchant name or default
      receiptId = createReceipt({
        merchantName: receipt.merchant,
        receiptName: receipt.merchant || undefined,
        date: receipt.date,
      });
    }
    
    const existingReceiptItems = currentBill.items.filter(item => item.receiptId === receiptId);

    // Add all scanned items with receipt_id (preserve full names - no truncation)
    receipt.items.forEach(item => {
      // Use unitPrice if available, otherwise calculate from totalPrice
      const unitMajor = item.unitPrice !== null
        ? item.unitPrice
        : (item.quantity > 0 ? item.totalPrice / item.quantity : item.totalPrice);
      const unitPriceMinor = toMinor(unitMajor, currencyCode);
      
      // Preserve full item name - never truncate (already cleaned by extractCanonicalName)
      const itemName = item.name;
      
      const alreadyExists = existingReceiptItems.some(existing =>
        existing.name === itemName &&
        existing.quantity === item.quantity &&
        Math.abs(existing.unitPriceMinor - unitPriceMinor) < 1
      );

      if (alreadyExists) {
        return;
      }

      addItem({
        name: itemName, // Full name preserved - no truncation
        unitPriceMinor: unitPriceMinor,
        lineTotalMinor: unitPriceMinor * item.quantity,
        quantity: item.quantity,
        needsReview: item.needsReview || false,
        assignees: [],
        isShared: false,
        receiptId: receiptId, // Assign receipt ID for grouping
      });
    });

    const hasMultipleReceipts = (currentBill.receipts?.length || 0) > 1;

    // Apply tax if detected
    if (receipt.tax) {
      if (hasMultipleReceipts) {
        updateReceiptExtra(receiptId, 'tax', { mode: 'fixed', value: toMinor(receipt.tax, currencyCode), isInclusive: false });
      } else {
        const taxAdj = currentBill.adjustments.find(a => a.type === 'tax');
        if (taxAdj) {
          updateAdjustment(taxAdj.id, { 
            mode: 'fixed', 
            value: toMinor(receipt.tax, currencyCode),
            isInclusive: false,
          });
        }
      }
    }

    // Apply service charge if detected
    if (receipt.serviceCharge) {
      if (hasMultipleReceipts) {
        updateReceiptExtra(receiptId, 'service', { mode: 'fixed', value: toMinor(receipt.serviceCharge, currencyCode), isInclusive: false });
      } else {
        const serviceAdj = currentBill.adjustments.find(a => a.type === 'service');
        if (serviceAdj) {
          updateAdjustment(serviceAdj.id, { 
            mode: 'fixed', 
            value: toMinor(receipt.serviceCharge, currencyCode),
            isInclusive: false,
          });
        }
      }
    }
  };

  const subtotal = currentBill.items.reduce(
    (sum, item) => sum + item.lineTotalMinor,
    0
  );

  const receipts = currentBill.receipts || [];
  const statuses = useMemo(() => getReceiptStatuses(currentBill), [currentBill]);
  const attentionIds = useMemo(
    () => statuses.filter(s => s.missingPayer || s.needsReview).map(s => s.receiptId),
    [statuses]
  );

  const receiptIdsKey = useMemo(
    () => receipts.map(r => r.id).join('|'),
    [receipts]
  );

  useEffect(() => {
    if (!receiptIdsKey) return;
    if (prevReceiptIdsKey.current !== receiptIdsKey) {
      setExpandedIds(getDefaultExpandedReceiptIds(receipts, statuses));
      prevReceiptIdsKey.current = receiptIdsKey;
    }
  }, [receiptIdsKey, receipts, statuses]);

  const toggleReceipt = (receiptId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(receiptId)) next.delete(receiptId);
      else next.add(receiptId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(receipts.map(r => r.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  useEffect(() => {
    if (showOnlyAttention) {
      setExpandedIds(new Set(attentionIds));
    }
  }, [showOnlyAttention, attentionIds]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
          <ShoppingBag className="w-8 h-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold">What's on the bill?</h2>
        <p className="text-muted-foreground">Add items and assign them to people</p>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          onClick={() => {
            const receiptId = createReceipt();
            setScanTargetReceiptId(receiptId);
            setScannerOpen(true);
          }}
          className="w-full flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" />
          Scan New Receipt
        </Button>
        <Button
          variant="ghost"
          onClick={() => createReceipt()}
          className="w-full flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Empty Receipt
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={expandAll}>
          Expand all
        </Button>
        <Button size="sm" variant="outline" onClick={collapseAll}>
          Collapse all
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowOnlyAttention(prev => !prev)}
        >
          {showOnlyAttention ? 'Show all receipts' : 'Show only needs attention'}
        </Button>
      </div>

      <ReceiptScanner
        open={scannerOpen}
        onClose={() => {
          setScannerOpen(false);
          setScanTargetReceiptId(null);
        }}
        onComplete={handleScanComplete}
        targetReceiptId={scanTargetReceiptId}
        currencyCode={currentBill.currencyCode || currentBill.currency || 'USD'}
      />

      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {receipts.map((receipt) => {
            const status = statuses.find(s => s.receiptId === receipt.id);
            if (!status) return null;
            const isOpen = expandedIds.has(receipt.id);
            return (
              <ReceiptAccordionCard
                key={receipt.id}
                receiptId={receipt.id}
                status={status}
                currencyCode={currentBill.currencyCode || currentBill.currency || 'USD'}
                currencyLocale={currentBill.currencyLocale}
                isOpen={isOpen}
                  onToggle={toggleReceipt}
              >
                <ReceiptCard
                  receipt={receipt}
                  items={currentBill.items.filter(item => item.receiptId === receipt.id)}
                  participants={currentBill.participants}
                  currencyCode={currentBill.currencyCode || currentBill.currency || 'USD'}
                  currencyLocale={currentBill.currencyLocale}
                  extras={currentBill.receiptExtrasById?.[receipt.id] || { tax: { mode: 'percentage', value: 0, isInclusive: false }, service: { mode: 'percentage', value: 0, isInclusive: false }, tip: { mode: 'percentage', value: 0, isInclusive: false } }}
                  subtotalMinor={calculateReceiptSubtotal(currentBill, receipt.id)}
                  extrasTotalMinor={calculateReceiptExtrasTotal(currentBill, receipt.id)}
                  totalMinor={calculateReceiptSubtotal(currentBill, receipt.id) + calculateReceiptExtrasTotal(currentBill, receipt.id)}
                  onScan={(receiptId) => {
                    setScanTargetReceiptId(receiptId);
                    setScannerOpen(true);
                  }}
                  onDelete={(receiptId) => {
                    removeReceipt(receiptId);
                  }}
                  onUpdateReceipt={(receiptId, updates) => updateReceipt(receiptId, updates)}
                  onAddItem={handleAddItemToReceipt}
                  onUpdateExtra={updateReceiptExtra}
                  onEditItem={(item) => {
                    const editableItem = {
                      id: item.id,
                      name: item.name,
                      quantity: item.quantity,
                      unitPrice: fromMinor(item.unitPriceMinor, currentBill.currencyCode || currentBill.currency || 'USD'),
                      totalPrice: fromMinor(item.lineTotalMinor, currentBill.currencyCode || currentBill.currency || 'USD'),
                      confidence: 1.0,
                      needsReview: item.needsReview || false,
                      rawText: item.name,
                      isEdited: false,
                    };
                    setEditingItem(editableItem);
                  }}
                  onRemoveItem={(itemId) => removeItem(itemId)}
                  onToggleAssignment={toggleAssignment}
                />
              </ReceiptAccordionCard>
            );
          })}
        </AnimatePresence>
      </div>

      {receipts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No receipts yet. Add a receipt to start grouping items.</p>
        </div>
      )}

      {currentBill.items.length > 0 && (
        <div className="bg-secondary/50 rounded-xl p-4 flex justify-between items-center">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-display font-bold text-xl">
            {formatCurrency(subtotal, currentBill.currencyCode || currentBill.currency || 'USD', currentBill.currencyLocale)}
          </span>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button
          onClick={prevStep}
          variant="outline"
          className="flex-1 h-12"
          size="lg"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
        <Button
          onClick={nextStep}
          className="flex-1 h-12 font-semibold"
          size="lg"
        >
          Continue
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>

      {/* Edit Item Dialog */}
      {editingItem && (
        <EditReceiptItem
          item={editingItem}
          currencyCode={currentBill.currencyCode || currentBill.currency || 'USD'}
          onSave={(updated) => {
            updateItem(updated.id, {
              name: updated.name,
              quantity: updated.quantity,
              unitPriceMinor: toMinor(updated.totalPrice / updated.quantity, currentBill.currencyCode || currentBill.currency || 'USD'),
              lineTotalMinor: toMinor(updated.totalPrice, currentBill.currencyCode || currentBill.currency || 'USD'),
            });
            setEditingItem(null);
          }}
          onCancel={() => setEditingItem(null)}
        />
      )}
    </motion.div>
  );
}
