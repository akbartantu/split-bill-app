import { Trash2 } from 'lucide-react';
import type { Payment, Participant } from '@/types/bill';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SmartNumberInput } from '@/components/inputs/SmartNumberInput';
import { fromMinor, toMinor } from '@/lib/money';
import { getCurrencyDecimals } from '@/lib/currency';

interface PaymentRowProps {
  payment: Payment;
  participants: Participant[];
  currencyCode: string;
  onUpdate: (id: string, updates: Partial<Payment>) => void;
  onRemove: (id: string) => void;
}

export function PaymentRow({ payment, participants, currencyCode, onUpdate, onRemove }: PaymentRowProps) {
  const decimals = getCurrencyDecimals(currencyCode);
  return (
    <div className="flex items-center gap-2">
      <Select
        value={payment.payerId}
        onValueChange={(value) => onUpdate(payment.id, { payerId: value })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Payer" />
        </SelectTrigger>
        <SelectContent>
          {participants.map(p => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <SmartNumberInput
        value={fromMinor(payment.amountMinor, currencyCode)}
        mode="money"
        decimals={decimals}
        onChangeValue={(value) => onUpdate(payment.id, { amountMinor: toMinor(value, currencyCode) })}
        placeholder="0.00"
        className="flex-1"
      />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(payment.id)}
        className="text-destructive"
        title="Remove payment"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
