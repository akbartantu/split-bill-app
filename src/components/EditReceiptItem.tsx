/**
 * Editable Receipt Item Component
 * 
 * Allows inline editing of scanned receipt items:
 * - Name, quantity, unit price, total price
 * - Validates inputs
 * - Recalculates derived values
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Edit, Save, X as CloseIcon, AlertCircle } from 'lucide-react';
import type { ParsedItem } from '@/lib/ocr';
import { MoneyInput } from '@/components/inputs/MoneyInput';
import { fromMinor, toMinor } from '@/lib/money';
import { getCurrencyDecimals } from '@/lib/currency';

export interface EditableReceiptItem extends ParsedItem {
  isEdited?: boolean;
}

interface EditReceiptItemProps {
  item: EditableReceiptItem;
  onSave: (updated: EditableReceiptItem) => void;
  onCancel: () => void;
  currencyCode?: string;
}

export function EditReceiptItem({ item, onSave, onCancel, currencyCode = 'USD' }: EditReceiptItemProps) {
  // Use item.id as key to ensure state is reset when editing different item
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [unitPriceMinor, setUnitPriceMinor] = useState(item.unitPrice !== null ? toMinor(item.unitPrice, currencyCode) : 0);
  const [totalPriceMinor, setTotalPriceMinor] = useState(toMinor(item.totalPrice, currencyCode));
  const [unitManual, setUnitManual] = useState(false);
  const [totalManual, setTotalManual] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const decimals = getCurrencyDecimals(currencyCode);

  // Reset state when item changes (prevents stale state glitch)
  useEffect(() => {
    setName(item.name);
    setQuantity(item.quantity.toString());
    setUnitPriceMinor(item.unitPrice !== null ? toMinor(item.unitPrice, currencyCode) : 0);
    setTotalPriceMinor(toMinor(item.totalPrice, currencyCode));
    setUnitManual(false);
    setTotalManual(false);
    setErrors({});
  }, [item.id]); // Reset when item.id changes

  // Recalculate derived values based on manual flags
  useEffect(() => {
    const qty = parseFloat(quantity) || 1;
    const unit = unitPriceMinor;
    const total = totalPriceMinor;

    if (qty <= 0) {
      return;
    }

    // If user edits unit price, recompute total (unless total is manual)
    if (unitManual && !totalManual && unit !== null) {
      const calculatedTotal = Math.round(qty * unit);
      if (calculatedTotal !== totalPriceMinor) {
        setTotalPriceMinor(calculatedTotal);
      }
    }

    // If user edits total price, recompute unit (unless unit is manual)
    if (totalManual && !unitManual && total !== null) {
      const calculatedUnit = Math.round(total / qty);
      if (calculatedUnit !== unitPriceMinor) {
        setUnitPriceMinor(calculatedUnit);
      }
    }
  }, [quantity, unitPriceMinor, totalPriceMinor, unitManual, totalManual]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Item name must be at least 2 characters';
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 1) {
      newErrors.quantity = 'Quantity must be at least 1';
    }

    const total = totalPriceMinor;
    if (Number.isNaN(total) || total < 0) {
      newErrors.totalPrice = 'Total price must be >= 0';
    }

    // Validate decimal places
    if (total > 0 && decimals === 2 && total % 1 !== 0) {
      newErrors.totalPrice = 'Total price must have 2 decimal places (e.g., 10.50)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      return;
    }

    const qty = parseFloat(quantity) || 1;
    const total = totalPriceMinor || 0;
    const unit = unitPriceMinor || (qty > 0 ? Math.round(total / qty) : null);

    const updated: EditableReceiptItem = {
      ...item,
      name: name.trim(),
      quantity: qty,
      totalPrice: fromMinor(total, currencyCode),
      unitPrice: unit !== null ? fromMinor(unit, currencyCode) : null,
      isEdited: true,
      confidence: Math.min(1, item.confidence + 0.1), // Slightly increase confidence after edit
    };

    onSave(updated);
  };

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Edit Item
          </DialogTitle>
          <DialogDescription>
            Update item details. Changes will be saved when you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Item Name */}
          <div className="space-y-2">
            <Label htmlFor="item-name">Item Name</Label>
            <Input
              id="item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item name"
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="item-quantity">Quantity</Label>
            <Input
              id="item-quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={errors.quantity ? 'border-destructive' : ''}
            />
            {errors.quantity && (
              <p className="text-xs text-destructive">{errors.quantity}</p>
            )}
          </div>

          {/* Unit Price */}
          <div className="space-y-2">
            <Label htmlFor="item-unit-price">Unit Price</Label>
            <MoneyInput
              inputId="item-unit-price"
              valueMinor={unitPriceMinor}
              currencyCode={currencyCode}
              onChangeMinor={(valueMinor) => {
                setUnitPriceMinor(valueMinor);
                if (valueMinor === 0) {
                  setUnitManual(false);
                } else {
                  setUnitManual(true);
                  setTotalManual(false);
                }
              }}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">
              Auto-calculated from total if not specified
            </p>
          </div>

          {/* Total Price */}
          <div className="space-y-2">
            <Label htmlFor="item-total-price">Total Price</Label>
            <MoneyInput
              inputId="item-total-price"
              valueMinor={totalPriceMinor}
              currencyCode={currencyCode}
              onChangeMinor={(valueMinor) => {
                setTotalPriceMinor(valueMinor);
                if (valueMinor === 0) {
                  setTotalManual(false);
                } else {
                  setTotalManual(true);
                  setUnitManual(false);
                }
              }}
              placeholder="0.00"
              className={errors.totalPrice ? 'border-destructive' : ''}
            />
            {errors.totalPrice && (
              <p className="text-xs text-destructive">{errors.totalPrice}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {quantity && parseFloat(quantity) > 1 && unitPriceMinor > 0 && (
                <>Expected: {fromMinor(Math.round(parseFloat(quantity) * unitPriceMinor), currencyCode).toFixed(decimals)}</>
              )}
            </p>
          </div>

          {/* Original OCR Info */}
          {item.rawText && (
            <div className="p-3 bg-muted rounded-lg text-xs">
              <p className="font-medium mb-1">Original OCR:</p>
              <p className="text-muted-foreground font-mono">{item.rawText}</p>
            </div>
          )}

          {/* Correction Metadata */}
          {item.correctionMetadata && (
            <div className="p-3 bg-warning/10 rounded-lg text-xs border border-warning/20">
              <div className="flex items-center gap-2 text-warning mb-1">
                <AlertCircle className="w-4 h-4" />
                <p className="font-medium">Auto-corrected</p>
              </div>
              <p className="text-muted-foreground">
                {item.correctionMetadata.correctionType}: ${item.correctionMetadata.originalValue.toFixed(2)} → ${item.correctionMetadata.correctedValue.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1"
          >
            <CloseIcon className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1"
          >
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
