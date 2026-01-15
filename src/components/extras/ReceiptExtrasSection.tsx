import type { ReceiptExtraType, ReceiptExtras } from '@/types/bill';
import { SmartNumberInput } from '@/components/inputs/SmartNumberInput';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import { fromMinor, toMinor } from '@/lib/money';
import { getCurrencyDecimals } from '@/lib/currency';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ReceiptExtrasSectionProps {
  receiptId: string;
  extras: ReceiptExtras;
  subtotalMinor: number;
  extrasTotalMinor: number;
  totalMinor: number;
  currencyCode: string;
  currencyLocale?: string;
  onUpdateExtra: (receiptId: string, type: ReceiptExtraType, updates: Partial<ReceiptExtras[ReceiptExtraType]>) => void;
}

const extraLabels: Record<ReceiptExtraType, { name: string; icon: string }> = {
  tax: { name: 'Tax', icon: '🏛️' },
  service: { name: 'Service', icon: '👨‍🍳' },
  tip: { name: 'Tip', icon: '💝' },
};

export function ReceiptExtrasSection({
  receiptId,
  extras,
  subtotalMinor,
  extrasTotalMinor,
  totalMinor,
  currencyCode,
  currencyLocale,
  onUpdateExtra,
}: ReceiptExtrasSectionProps) {
  const types: ReceiptExtraType[] = ['tax', 'service', 'tip'];
  const decimals = getCurrencyDecimals(currencyCode);

  return (
    <div className="space-y-4">
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
                        ? Math.round(subtotalMinor * (extra.value / 100))
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
                    onClick={() => onUpdateExtra(receiptId, type, { mode: 'percentage' })}
                    className={cn(
                      'px-3 py-2 text-sm transition-colors',
                      extra.mode === 'percentage'
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-secondary'
                    )}
                  >
                    %
                  </button>
                  <button
                    onClick={() => onUpdateExtra(receiptId, type, { mode: 'fixed' })}
                    className={cn(
                      'px-3 py-2 text-sm transition-colors',
                      extra.mode === 'fixed'
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-secondary'
                    )}
                  >
                    $
                  </button>
                </div>

                <SmartNumberInput
                  value={extra.mode === 'percentage' ? extra.value || 0 : fromMinor(Math.round(extra.value), currencyCode)}
                  mode={extra.mode === 'percentage' ? 'percent' : 'money'}
                  decimals={extra.mode === 'percentage' ? 2 : decimals}
                  onChangeValue={(value) => onUpdateExtra(
                    receiptId,
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
                  id={`inclusive-${receiptId}-${type}`}
                  checked={extra.isInclusive}
                  onCheckedChange={(checked) => onUpdateExtra(receiptId, type, { isInclusive: checked })}
                />
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor={`inclusive-${receiptId}-${type}`}
                    className="text-sm text-muted-foreground cursor-pointer"
                  >
                    Already included in prices
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground cursor-help">ⓘ</span>
                    </TooltipTrigger>
                    <TooltipContent>When enabled, this extra won’t add to the total.</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Receipt Subtotal</span>
          <span>{formatCurrency(subtotalMinor, currencyCode, currencyLocale)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Receipt Extras</span>
          <span>{formatCurrency(extrasTotalMinor, currencyCode, currencyLocale)}</span>
        </div>
        <div className="border-t border-border pt-2 flex justify-between">
          <span className="font-medium">Receipt Total</span>
          <span className="font-display font-bold text-lg text-primary">
            {formatCurrency(totalMinor, currencyCode, currencyLocale)}
          </span>
        </div>
      </div>
    </div>
  );
}
