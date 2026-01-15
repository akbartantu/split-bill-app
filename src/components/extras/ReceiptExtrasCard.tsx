import { DollarSign, Percent } from 'lucide-react';
import type { Receipt, ReceiptExtraType, ReceiptExtras } from '@/types/bill';
import { SmartNumberInput } from '@/components/inputs/SmartNumberInput';
import { fromMinor, toMinor } from '@/lib/money';
import { getCurrencyDecimals } from '@/lib/currency';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/calculations';
import { cn } from '@/lib/utils';

interface ReceiptExtrasCardProps {
  receipt: Receipt;
  extras: ReceiptExtras;
  subtotal: number;
  extrasTotal: number;
  grandTotal: number;
  currencyCode: string;
  currencyLocale?: string;
  onUpdateExtra: (receiptId: string, type: ReceiptExtraType, updates: Partial<ReceiptExtras[ReceiptExtraType]>) => void;
}

const extraLabels: Record<ReceiptExtraType, { name: string; icon: string }> = {
  tax: { name: 'Tax', icon: '🏛️' },
  service: { name: 'Service', icon: '👨‍🍳' },
  tip: { name: 'Tip', icon: '💝' },
};

export function ReceiptExtrasCard({
  receipt,
  extras,
  subtotal,
  extrasTotal,
  grandTotal,
  currencyCode,
  currencyLocale,
  onUpdateExtra,
}: ReceiptExtrasCardProps) {
  const types: ReceiptExtraType[] = ['tax', 'service', 'tip'];
  const decimals = getCurrencyDecimals(currencyCode);

  return (
    <div className="bg-card rounded-xl p-4 shadow-card space-y-4">
      <div>
        <p className="font-medium">{receipt.receiptName || receipt.merchantName || 'Receipt'}</p>
        {receipt.location && (
          <p className="text-xs text-muted-foreground">{receipt.location}</p>
        )}
      </div>

      <div className="space-y-4">
        {types.map((type) => {
          const extra = extras[type];
          const label = extraLabels[type];
          return (
            <div key={type} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{label.icon}</span>
                  <div>
                    <p className="font-medium">{label.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {extra.isInclusive ? 'Already included' : 'Added on top'}
                    </p>
                  </div>
                </div>
                {extra.value > 0 && !extra.isInclusive && (
                  <span className={cn("font-mono-nums font-semibold", 'text-primary')}>
                    +{formatCurrency(
                      extra.mode === 'percentage'
                        ? Math.round(subtotal * (extra.value / 100))
                        : Math.round(extra.value),
                      currencyCode,
                      currencyLocale
                    )}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => onUpdateExtra(receipt.id, type, { mode: 'percentage' })}
                    className={cn(
                      'px-3 py-2 text-sm transition-colors',
                      extra.mode === 'percentage'
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-secondary'
                    )}
                  >
                    <Percent className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onUpdateExtra(receipt.id, type, { mode: 'fixed' })}
                    className={cn(
                      'px-3 py-2 text-sm transition-colors',
                      extra.mode === 'fixed'
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-secondary'
                    )}
                  >
                    <DollarSign className="w-4 h-4" />
                  </button>
                </div>

                <SmartNumberInput
                  value={extra.mode === 'percentage' ? extra.value || 0 : fromMinor(Math.round(extra.value), currencyCode)}
                  mode={extra.mode === 'percentage' ? 'percent' : 'money'}
                  decimals={extra.mode === 'percentage' ? 2 : decimals}
                  onChangeValue={(value) => onUpdateExtra(
                    receipt.id,
                    type,
                    { value: extra.mode === 'percentage' ? value : toMinor(value, currencyCode) }
                  )}
                  placeholder="0"
                  className="flex-1"
                />

                {extra.mode === 'percentage' && (
                  <span className="text-muted-foreground">%</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id={`inclusive-${receipt.id}-${type}`}
                  checked={extra.isInclusive}
                  onCheckedChange={(checked) => onUpdateExtra(receipt.id, type, { isInclusive: checked })}
                />
                <Label
                  htmlFor={`inclusive-${receipt.id}-${type}`}
                  className="text-sm text-muted-foreground cursor-pointer"
                >
                  Already included in prices
                </Label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Receipt Subtotal</span>
          <span>{formatCurrency(subtotal, currencyCode, currencyLocale)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Receipt Extras</span>
          <span>{formatCurrency(extrasTotal, currencyCode, currencyLocale)}</span>
        </div>
        <div className="border-t border-border pt-2 flex justify-between">
          <span className="font-medium">Receipt Total</span>
          <span className="font-display font-bold text-lg text-primary">
            {formatCurrency(grandTotal, currencyCode, currencyLocale)}
          </span>
        </div>
      </div>
    </div>
  );
}
