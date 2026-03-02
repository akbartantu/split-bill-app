import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReceiptStatus } from '@/selectors/receiptStatus';
import { ReceiptHeaderSummary } from '@/components/receipts/ReceiptHeaderSummary';
import { cn } from '@/lib/utils';

interface ReceiptAccordionCardProps {
  receiptId: string;
  status: ReceiptStatus;
  currencyCode: string;
  currencyLocale?: string;
  isOpen: boolean;
  onToggle: (receiptId: string) => void;
  children?: React.ReactNode;
}

export function ReceiptAccordionCard({
  receiptId,
  status,
  currencyCode,
  currencyLocale,
  isOpen,
  onToggle,
  children,
}: ReceiptAccordionCardProps) {
  return (
    <div
      id={`receipt-${receiptId}`}
      className={cn('bg-card rounded-xl shadow-card p-4 space-y-4')}
    >
      <button
        type="button"
        onClick={() => onToggle(receiptId)}
        className="w-full text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-start gap-3">
          <span className="text-muted-foreground pt-1">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <div className="flex-1">
            <ReceiptHeaderSummary
              status={status}
              currencyCode={currencyCode}
              currencyLocale={currencyLocale}
            />
          </div>
        </div>
      </button>

      {isOpen && (
        <div
          className="pt-2 border-t border-border/60"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}
