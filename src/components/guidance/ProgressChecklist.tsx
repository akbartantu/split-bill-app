import { Button } from '@/components/ui/button';
import type { ChecklistStatus } from '@/selectors/checklistStatus';
import { cn } from '@/lib/utils';

interface ProgressChecklistProps {
  status: ChecklistStatus;
  onGoPeople?: () => void;
  onGoSplit?: () => void;
  onFixReceipt?: (receiptId: string) => void;
}

export function ProgressChecklist({
  status,
  onGoPeople,
  onGoSplit,
  onFixReceipt,
}: ProgressChecklistProps) {
  const items = [
    {
      label: 'People added',
      ok: status.peopleReady,
      helper: status.peopleReady ? 'Ready' : 'Add at least one person',
      action: onGoPeople ? { label: 'Go to People', onClick: onGoPeople } : null,
    },
    {
      label: 'Receipt added',
      ok: status.receiptsReady,
      helper: status.receiptsReady ? 'Ready' : 'Add a receipt',
    },
    {
      label: 'Items assigned',
      ok: status.itemsAssigned,
      helper: status.itemsAssigned ? 'Ready' : `${status.unassignedItemCount} unassigned item(s)`,
    },
    {
      label: 'Payer set',
      ok: status.payerReady,
      helper: status.payerReady ? 'Ready' : 'Set a payer for each receipt',
      action: !status.payerReady && status.missingPayerReceiptIds[0] && onFixReceipt
        ? {
            label: 'Fix payer',
            onClick: () => onFixReceipt(status.missingPayerReceiptIds[0]),
          }
        : null,
    },
    {
      label: 'Settlement ready',
      ok: status.settlementReady,
      helper: status.settlementReady ? 'Ready to split' : 'Finish payer setup',
      action: status.settlementReady && onGoSplit ? { label: 'Go to Split', onClick: onGoSplit } : null,
    },
  ];

  return (
    <div className="bg-card rounded-xl p-4 shadow-card space-y-3">
      <div>
        <p className="font-medium">Checklist</p>
        <p className="text-xs text-muted-foreground">Stay on track</p>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className={cn('text-xs', item.ok ? 'text-emerald-600' : 'text-warning')}>
                {item.ok ? '✅' : '⚠️'} {item.helper}
              </p>
            </div>
            {item.action && (
              <Button size="sm" variant="outline" onClick={item.action.onClick}>
                {item.action.label}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
