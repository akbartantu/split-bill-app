import type { ReceiptIssue, ReceiptStatus } from '@/selectors/receiptStatus';
import { Button } from '@/components/ui/button';

interface NeedsAttentionPanelProps {
  issues: ReceiptIssue[];
  statuses: ReceiptStatus[];
  onFix: (receiptId: string) => void;
}

export function NeedsAttentionPanel({
  issues,
  statuses,
  onFix,
}: NeedsAttentionPanelProps) {
  if (issues.length === 0) return null;

  const grouped = issues.reduce<Record<string, ReceiptIssue[]>>((acc, issue) => {
    acc[issue.receiptId] = acc[issue.receiptId] || [];
    acc[issue.receiptId].push(issue);
    return acc;
  }, {});

  return (
    <div className="bg-card rounded-xl p-4 shadow-card space-y-3">
      <div>
        <p className="font-medium">Needs attention</p>
        <p className="text-xs text-muted-foreground">Fix these before splitting</p>
      </div>
      <div className="space-y-2">
        {Object.entries(grouped).map(([receiptId, receiptIssues]) => {
          const status = statuses.find(s => s.receiptId === receiptId);
          return (
            <div key={receiptId} className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{status?.receiptName || 'Receipt'}</p>
                <p className="text-xs text-muted-foreground">
                  {receiptIssues.map(i => i.label).join(' • ')}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onFix(receiptId)}>
                Fix
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
