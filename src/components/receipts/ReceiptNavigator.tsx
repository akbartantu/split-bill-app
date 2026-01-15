import { useMemo, useState } from 'react';
import type { ReceiptStatus } from '@/selectors/receiptStatus';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ReceiptNavigatorProps {
  statuses: ReceiptStatus[];
  activeReceiptId?: string | null;
  onSelect: (receiptId: string) => void;
}

export function ReceiptNavigator({
  statuses,
  activeReceiptId,
  onSelect,
}: ReceiptNavigatorProps) {
  const [filter, setFilter] = useState<'all' | 'needs_attention'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return statuses;
    return statuses.filter(s => s.missingPayer || s.needsReview || !s.hasItems);
  }, [filter, statuses]);

  return (
    <>
      {/* Mobile: dropdown */}
      <div className="lg:hidden sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-2">
        <Select
          value={activeReceiptId || (filtered[0]?.receiptId ?? '')}
          onValueChange={onSelect}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Jump to receipt" />
          </SelectTrigger>
          <SelectContent>
            {filtered.map(r => (
              <SelectItem key={r.receiptId} value={r.receiptId}>
                {r.receiptName} ({r.itemCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: sidebar */}
      <div className="hidden lg:block sticky top-24 self-start bg-card rounded-xl p-3 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Receipts</p>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                'px-2 py-1 rounded-full',
                filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
              )}
            >
              All
            </button>
            <button
              onClick={() => setFilter('needs_attention')}
              className={cn(
                'px-2 py-1 rounded-full',
                filter === 'needs_attention' ? 'bg-primary text-primary-foreground' : 'bg-secondary'
              )}
            >
              Needs attention
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {filtered.map(r => (
            <button
              key={r.receiptId}
              onClick={() => onSelect(r.receiptId)}
              className={cn(
                'w-full text-left p-2 rounded-lg text-sm transition',
                activeReceiptId === r.receiptId ? 'bg-secondary' : 'hover:bg-secondary/60'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      r.missingPayer ? 'bg-destructive' : r.needsReview ? 'bg-warning' : r.hasItems ? 'bg-emerald-500' : 'bg-muted'
                    )}
                  />
                  <span className="truncate">{r.receiptName}</span>
                </div>
                <span className="text-xs text-muted-foreground">{r.itemCount}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {r.missingPayer ? 'Missing payer' : r.needsReview ? 'Needs review' : r.hasItems ? 'Ready' : 'Empty'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
