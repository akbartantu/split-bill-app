import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { getNetBalanceSummary } from '@/selectors/netBalances';
import { getSettlementFromNet } from '@/selectors/settlement';
import { formatCurrency } from '@/lib/calculations';
import type { Bill } from '@/types/bill';

interface SettlementSectionProps {
  bill: Bill;
}

export function SettlementSection({ bill }: SettlementSectionProps) {
  const currencyCode = bill.currencyCode || bill.currency || 'USD';
  const currencyLocale = bill.currencyLocale;
  const summary = useMemo(() => getNetBalanceSummary(bill), [bill]);
  const transfers = useMemo(
    () => getSettlementFromNet(summary.netByPerson, bill.participants.map(p => p.id)),
    [summary.netByPerson, bill.participants]
  );

  const missingReceipts = summary.missingPayerReceiptIds;

  const handleCopy = async () => {
    const lines = transfers.map(t => {
      const from = bill.participants.find(p => p.id === t.fromId)?.name || t.fromId;
      const to = bill.participants.find(p => p.id === t.toId)?.name || t.toId;
      return `${from} -> ${to}: ${formatCurrency(t.amountMinor, currencyCode, currencyLocale)}`;
    });
    await navigator.clipboard.writeText(lines.join('\n'));
  };

  return (
    <div className="bg-card rounded-xl p-4 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Payments to make</h3>
          <p className="text-sm text-muted-foreground">Where to pay and how much</p>
        </div>
        {transfers.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleCopy}>
            Copy summary
          </Button>
        )}
      </div>

      {missingReceipts.length > 0 && (
        <div className="text-xs text-warning">
          Some receipts have no “Paid by” set. Settlement may be incomplete.
        </div>
      )}

      {transfers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Set “Paid by” for each receipt in Items to generate payment instructions.
        </p>
      ) : (
        <div className="space-y-2">
          {transfers.map((t, idx) => {
            const from = bill.participants.find(p => p.id === t.fromId)?.name || t.fromId;
            const to = bill.participants.find(p => p.id === t.toId)?.name || t.toId;
            return (
              <div key={idx} className="flex justify-between text-sm">
                <span>{from} → {to}</span>
                <span>{formatCurrency(t.amountMinor, currencyCode, currencyLocale)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
