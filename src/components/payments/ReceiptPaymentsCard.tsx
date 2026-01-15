import { Plus } from 'lucide-react';
import type { Payment, Participant, Receipt } from '@/types/bill';
import { Button } from '@/components/ui/button';
import { PaymentRow } from '@/components/payments/PaymentRow';
import { formatCurrency } from '@/lib/calculations';

interface ReceiptPaymentsCardProps {
  receipt: Receipt;
  payments: Payment[];
  participants: Participant[];
  receiptTotalCents: number;
  paidCents: number;
  currencyCode: string;
  currencyLocale?: string;
  onAddPayment: (receiptId: string) => void;
  onUpdatePayment: (id: string, updates: Partial<Payment>) => void;
  onRemovePayment: (id: string) => void;
}

export function ReceiptPaymentsCard({
  receipt,
  payments,
  participants,
  receiptTotalCents,
  paidCents,
  currencyCode,
  currencyLocale,
  onAddPayment,
  onUpdatePayment,
  onRemovePayment,
}: ReceiptPaymentsCardProps) {
  const remainingCents = receiptTotalCents - paidCents;
  const mismatch = Math.abs(remainingCents) > 1;

  return (
    <div className="bg-card rounded-xl p-4 shadow-card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{receipt.receiptName || receipt.merchantName || 'Receipt'}</p>
          {receipt.location && (
            <p className="text-xs text-muted-foreground">{receipt.location}</p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => onAddPayment(receipt.id)}>
          <Plus className="w-4 h-4 mr-2" />
          Add payment
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-muted-foreground">Receipt total</p>
          <p className="font-medium">{formatCurrency(receiptTotalCents, currencyCode, currencyLocale)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Paid</p>
          <p className="font-medium">{formatCurrency(paidCents, currencyCode, currencyLocale)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Remaining</p>
          <p className={`font-medium ${mismatch ? 'text-destructive' : ''}`}>
            {formatCurrency(remainingCents, currencyCode, currencyLocale)}
          </p>
        </div>
      </div>

      {mismatch && (
        <p className="text-xs text-destructive">
          Payments don’t match receipt total.
        </p>
      )}

      <div className="space-y-2">
        {payments.map(payment => (
          <PaymentRow
            key={payment.id}
            payment={payment}
            participants={participants}
            currencyCode={currencyCode}
            onUpdate={onUpdatePayment}
            onRemove={onRemovePayment}
          />
        ))}
        {payments.length === 0 && (
          <p className="text-xs text-muted-foreground">No payments added yet.</p>
        )}
      </div>
    </div>
  );
}
