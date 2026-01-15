import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Plus, Trash2 } from 'lucide-react';
import type { BillItem, Participant, Receipt } from '@/types/bill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/inputs/MoneyInput';
import { ReceiptExtrasSection } from '@/components/extras/ReceiptExtrasSection';
import { ReceiptPayerSection } from '@/components/payments/ReceiptPayerSection';
import type { ReceiptExtras } from '@/types/bill';
import { ItemRow } from '@/components/items/ItemRow';

interface ReceiptCardProps {
  receipt: Receipt;
  items: BillItem[];
  participants: Participant[];
  currencyCode: string;
  currencyLocale?: string;
  extras: ReceiptExtras;
  subtotalMinor: number;
  extrasTotalMinor: number;
  totalMinor: number;
  onScan: (receiptId: string) => void;
  onDelete: (receiptId: string) => void;
  onUpdateReceipt: (receiptId: string, updates: Partial<Receipt>) => void;
  onAddItem: (receiptId: string, item: { name: string; quantity: number; unitPriceMinor: number }) => void;
  onUpdateExtra: (receiptId: string, type: import('@/types/bill').ReceiptExtraType, updates: Partial<ReceiptExtras[import('@/types/bill').ReceiptExtraType]>) => void;
  onEditItem: (item: BillItem) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleAssignment: (itemId: string, participantId: string) => void;
}

export function ReceiptCard({
  receipt,
  items,
  participants,
  currencyCode,
  currencyLocale,
  extras,
  subtotalMinor,
  extrasTotalMinor,
  totalMinor,
  onScan,
  onDelete,
  onUpdateReceipt,
  onAddItem,
  onUpdateExtra,
  onEditItem,
  onRemoveItem,
  onToggleAssignment,
}: ReceiptCardProps) {
  const [itemName, setItemName] = useState('');
  const [itemPriceMinor, setItemPriceMinor] = useState(0);
  const [itemQty, setItemQty] = useState('1');

  const handleAddItem = () => {
    if (!itemName.trim() || itemPriceMinor <= 0) return;
    const quantity = parseInt(itemQty) || 1;
    onAddItem(receipt.id, {
      name: itemName.trim(),
      quantity,
      unitPriceMinor: itemPriceMinor,
    });
    setItemName('');
    setItemPriceMinor(0);
    setItemQty('1');
  };

  const handleDelete = () => {
    const confirmed = window.confirm('Delete this receipt? Items will move to another receipt.');
    if (confirmed) {
      onDelete(receipt.id);
    }
  };

  return (
    <div className="bg-card rounded-xl p-4 shadow-card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Input
            value={receipt.receiptName}
            onChange={(e) => onUpdateReceipt(receipt.id, { receiptName: e.target.value })}
            placeholder="Receipt name"
            className="font-medium"
          />
          <Input
            value={receipt.location || ''}
            onChange={(e) => onUpdateReceipt(receipt.id, { location: e.target.value })}
            placeholder="Location (optional)"
            className="text-sm"
          />
          {receipt.date && (
            <p className="text-xs text-muted-foreground">
              {receipt.date}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onScan(receipt.id)}
            className="flex items-center gap-2"
          >
            <Camera className="w-4 h-4" />
            Scan
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="flex items-center gap-2 text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="bg-secondary/40 rounded-xl p-3 space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Item name"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className="flex-1"
          />
          <Input
            type="number"
            placeholder="Qty"
            value={itemQty}
            onChange={(e) => setItemQty(e.target.value)}
            className="w-16 text-center"
            min="1"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {''}
            </span>
            <MoneyInput
              valueMinor={itemPriceMinor}
              currencyCode={currencyCode}
              onChangeMinor={setItemPriceMinor}
              placeholder="0.00"
              className="pl-7"
            />
          </div>
          <Button
            onClick={handleAddItem}
            disabled={!itemName.trim() || itemPriceMinor <= 0}
            size="icon"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            participants={participants}
            currencyCode={currencyCode}
            onToggleAssignment={onToggleAssignment}
            onEdit={onEditItem}
            onRemove={onRemoveItem}
          />
        ))}
      </AnimatePresence>

      {items.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-4 text-muted-foreground text-sm"
        >
          No items yet for this receipt.
        </motion.div>
      )}

      <div className="pt-2 border-t border-border/50 space-y-4">
        <ReceiptExtrasSection
          receiptId={receipt.id}
          extras={extras}
          subtotalMinor={subtotalMinor}
          extrasTotalMinor={extrasTotalMinor}
          totalMinor={totalMinor}
          currencyCode={currencyCode}
          currencyLocale={currencyLocale}
          onUpdateExtra={onUpdateExtra}
        />
        <ReceiptPayerSection
          receipt={receipt}
          participants={participants}
          receiptTotalMinor={totalMinor}
          currencyCode={currencyCode}
          onUpdateReceipt={onUpdateReceipt}
        />
      </div>
    </div>
  );
}
