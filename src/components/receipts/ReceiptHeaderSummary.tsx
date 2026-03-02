import type { ReceiptStatus } from '@/selectors/receiptStatus';
import { formatCurrency } from '@/lib/calculations';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ReceiptHeaderSummaryProps {
  status: ReceiptStatus;
  currencyCode: string;
  currencyLocale?: string;
}

const statusStyles: Record<ReceiptStatus['status'], { label: string; className: string }> = {
  missing_payer: { label: 'Missing payer', className: 'bg-destructive/10 text-destructive' },
  needs_review: { label: 'Needs review', className: 'bg-warning/10 text-warning' },
  ready: { label: 'Ready', className: 'bg-emerald-100 text-emerald-700' },
  empty: { label: 'Empty', className: 'bg-muted text-muted-foreground' },
};

export function ReceiptHeaderSummary({
  status,
  currencyCode,
  currencyLocale,
}: ReceiptHeaderSummaryProps) {
  const badge = statusStyles[status.status];
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="font-medium">{status.receiptName}</p>
        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
          <span>{status.itemCount} item{status.itemCount !== 1 ? 's' : ''}</span>
          <span>•</span>
          <span>{formatCurrency(status.totalMinor, currencyCode, currencyLocale)}</span>
          <span>•</span>
          <span>Paid by {status.payerName || 'Not set'}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status.needsReview ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn('px-2 py-1 rounded-full text-xs font-medium', badge.className)}>
                {badge.label}
              </span>
            </TooltipTrigger>
            <TooltipContent>Items flagged for review need a quick check.</TooltipContent>
          </Tooltip>
        ) : (
          <span className={cn('px-2 py-1 rounded-full text-xs font-medium', badge.className)}>
            {badge.label}
          </span>
        )}
      </div>
    </div>
  );
}
