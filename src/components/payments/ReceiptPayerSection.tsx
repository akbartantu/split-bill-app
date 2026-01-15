import type { Participant, Receipt } from '@/types/bill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/inputs/MoneyInput';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ReceiptPayerSectionProps {
  receipt: Receipt;
  participants: Participant[];
  receiptTotalMinor: number;
  currencyCode: string;
  onUpdateReceipt: (receiptId: string, updates: Partial<Receipt>) => void;
}

export function ReceiptPayerSection({
  receipt,
  participants,
  receiptTotalMinor,
  currencyCode,
  onUpdateReceipt,
}: ReceiptPayerSectionProps) {
  const hasOverride = typeof receipt.paidAmountMinor === 'number';

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium">Paid by</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-help">ⓘ</span>
            </TooltipTrigger>
            <TooltipContent>This controls the “where to pay” list.</TooltipContent>
          </Tooltip>
        </div>
        <p className="text-xs text-muted-foreground">Who covered this receipt</p>
      </div>

      <Select
        value={receipt.payerPersonId || 'none'}
        onValueChange={(value) => {
          if (value === 'none') {
            onUpdateReceipt(receipt.id, { payerPersonId: null, paidAmountMinor: null });
            return;
          }
          onUpdateReceipt(receipt.id, { payerPersonId: value, paidAmountMinor: null });
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Not paid yet" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not paid yet</SelectItem>
          {participants.map(p => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {receipt.payerPersonId && (
        <div className="flex items-center justify-between">
          <Label htmlFor={`override-${receipt.id}`} className="text-sm text-muted-foreground">
            Paid different amount
          </Label>
          <Switch
            id={`override-${receipt.id}`}
            checked={hasOverride}
            onCheckedChange={(checked) => {
              onUpdateReceipt(receipt.id, { paidAmountMinor: checked ? receiptTotalMinor : null });
            }}
          />
        </div>
      )}

      {receipt.payerPersonId && hasOverride && (
        <MoneyInput
          valueMinor={receipt.paidAmountMinor || receiptTotalMinor}
          currencyCode={currencyCode}
          onChangeMinor={(valueMinor) => onUpdateReceipt(receipt.id, { paidAmountMinor: valueMinor })}
          placeholder="0.00"
        />
      )}
    </div>
  );
}
