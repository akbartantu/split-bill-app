import { useBillStore } from '@/store/billStore';
import { motion } from 'framer-motion';
import { PieChart, ArrowLeft, Share2, Copy, Check, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  calculateBillSplit, 
  calculateGrandTotal, 
  formatCurrency,
  generateShareText,
} from '@/lib/calculations';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getNetBalanceSummary } from '@/selectors/netBalances';
import { getSettlementFromNet } from '@/selectors/settlement';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1 },
};

export function SummaryStep() {
  const { currentBill, prevStep, resetBill, saveBillToHistory } = useBillStore();
  const [copied, setCopied] = useState(false);
  const [expandedPersonIds, setExpandedPersonIds] = useState<Set<string>>(new Set());
  const prevPersonKey = useRef<string>('');
  
  const summaries = calculateBillSplit(currentBill);
  const grandTotal = calculateGrandTotal(currentBill);
  const currencyCode = currentBill.currencyCode || currentBill.currency || 'USD';
  const currencyLocale = currentBill.currencyLocale;
  const balanceSummary = useMemo(() => getNetBalanceSummary(currentBill), [currentBill]);
  const transfers = useMemo(
    () => getSettlementFromNet(balanceSummary.netByPerson, currentBill.participants.map(p => p.id)),
    [balanceSummary.netByPerson, currentBill.participants]
  );
  const missingPayers = balanceSummary.missingPayerReceiptIds.length > 0;
  const showPaymentSections = !missingPayers && transfers.length > 0;
  const personKey = useMemo(
    () => summaries.map(s => s.participantId).join('|'),
    [summaries]
  );

  useEffect(() => {
    if (!personKey) return;
    if (prevPersonKey.current !== personKey) {
      setExpandedPersonIds(new Set(summaries.map(s => s.participantId)));
      prevPersonKey.current = personKey;
    }
  }, [personKey, summaries]);

  const handleShare = async () => {
    const text = generateShareText(currentBill, summaries);
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: currentBill.name || 'Bill Split',
          text,
        });
      } catch (e) {
        // User cancelled or share failed
        copyToClipboard(text);
      }
    } else {
      copyToClipboard(text);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error('Failed to copy');
    }
  };

  const handleCopyPayments = async () => {
    const lines = transfers.map(t => {
      const from = currentBill.participants.find(p => p.id === t.fromId)?.name || t.fromId;
      const to = currentBill.participants.find(p => p.id === t.toId)?.name || t.toId;
      return `${from} pays ${to}: ${formatCurrency(t.amountMinor, currencyCode, currencyLocale)}`;
    });
    await copyToClipboard(lines.join('\n'));
  };

  const handleNewBill = () => {
    saveBillToHistory();
    resetBill();
    toast.success('Bill saved! Starting fresh.');
  };

  // Calculate max for relative bar sizing
  const maxAmount = Math.max(...summaries.map(s => s.grandTotal), 1);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
          <PieChart className="w-8 h-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold">Here's the split</h2>
        <p className="text-muted-foreground">
          Total: {formatCurrency(grandTotal, currencyCode, currencyLocale)}
        </p>
      </div>

      <div className="flex items-center justify-between">
        {missingPayers && (
          <p className="text-xs text-warning">
            Set “Paid by” for each receipt in Items to generate payments.
          </p>
        )}
        {!missingPayers && transfers.length > 0 && (
          <Button size="sm" variant="outline" onClick={handleCopyPayments}>
            <Copy className="w-4 h-4 mr-2" />
            Copy payment summary
          </Button>
        )}
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-3"
      >
        {summaries.map((summary) => (
          <motion.div
            key={summary.participantId}
            variants={item}
            className="bg-card rounded-xl p-4 shadow-card overflow-hidden relative"
          >
            {/* Background progress bar */}
            <motion.div
              className="absolute inset-0 opacity-10"
              style={{ backgroundColor: summary.participantColor }}
              initial={{ scaleX: 0, transformOrigin: 'left' }}
              animate={{ scaleX: summary.grandTotal / maxAmount }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.3 }}
            />
            
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                  style={{ backgroundColor: summary.participantColor }}
                >
                  {summary.participantName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-lg">{summary.participantName}</p>
                  <p className="text-sm text-muted-foreground">
                    {summary.itemBreakdown.length} item{summary.itemBreakdown.length !== 1 ? 's' : ''}
                    {summary.adjustmentsShare !== 0 && (
                      <> {formatCurrency(summary.adjustmentsShare, currencyCode, currencyLocale)} adjustments</>
                    )}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedPersonIds(prev => {
                      const next = new Set(prev);
                      if (next.has(summary.participantId)) next.delete(summary.participantId);
                      else next.add(summary.participantId);
                      return next;
                    });
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={expandedPersonIds.has(summary.participantId) ? 'Collapse details' : 'Expand details'}
                >
                  {expandedPersonIds.has(summary.participantId)
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />
                  }
                </button>
                <motion.div
                  className="text-right"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.4, type: 'spring' }}
                >
                  <p 
                    className="font-display font-bold text-2xl"
                    style={{ color: summary.participantColor }}
                  >
                    {formatCurrency(summary.grandTotal, currencyCode, currencyLocale)}
                  </p>
                </motion.div>
              </div>
            </div>

            {/* Item breakdown - Grouped by receipt if available */}
            {expandedPersonIds.has(summary.participantId) && summary.receiptGroups && summary.receiptGroups.length > 0 ? (
              <motion.div 
                className="mt-3 pt-3 border-t border-border/50 space-y-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ delay: 0.5 }}
              >
                {summary.receiptGroups.length === 1 && (
                  <div className="text-xs font-medium text-muted-foreground">
                    {summary.receiptGroups[0].receiptLabel}
                  </div>
                )}
                {summary.receiptGroups.map((group) => (
                  <div key={group.receiptId} className="space-y-1">
                    {/* Receipt header - only show if multiple receipts */}
                    {summary.receiptGroups!.length > 1 && (
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          {group.receiptLabel}
                          {group.receiptDate && (
                            <span className="ml-2 text-xs opacity-70">
                              · {new Date(group.receiptDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {formatCurrency(group.groupTotalAmount, currencyCode, currencyLocale)}
                        </span>
                      </div>
                    )}
                    {/* Items in this receipt */}
                    {group.items.map((item) => (
                      <div key={item.itemId} className="flex justify-between text-sm text-muted-foreground pl-2">
                        <span>{item.itemName}</span>
                        <span>{formatCurrency(item.allocatedAmount, currencyCode, currencyLocale)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </motion.div>
            ) : expandedPersonIds.has(summary.participantId) && summary.itemBreakdown.length > 0 ? (
              // Fallback to legacy itemBreakdown if receiptGroups not available
              <motion.div 
                className="mt-3 pt-3 border-t border-border/50 space-y-1"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ delay: 0.5 }}
              >
                {summary.itemBreakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm text-muted-foreground">
                    <span>{item.itemName}</span>
                    <span>{formatCurrency(item.amount, currencyCode, currencyLocale)}</span>
                  </div>
                ))}
              </motion.div>
            ) : null}

            {showPaymentSections && expandedPersonIds.has(summary.participantId) && (
              <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground space-y-2">
                {transfers.filter(t => t.fromId === summary.participantId).length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground">You pay</p>
                    {transfers
                      .filter(t => t.fromId === summary.participantId)
                      .map((t, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>→ {currentBill.participants.find(p => p.id === t.toId)?.name}</span>
                          <span>{formatCurrency(t.amountMinor, currencyCode, currencyLocale)}</span>
                        </div>
                      ))}
                  </div>
                )}
                {transfers.filter(t => t.toId === summary.participantId).length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground">You receive</p>
                    {transfers
                      .filter(t => t.toId === summary.participantId)
                      .map((t, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{currentBill.participants.find(p => p.id === t.fromId)?.name} →</span>
                          <span>{formatCurrency(t.amountMinor, currencyCode, currencyLocale)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* Visual pie representation */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6 }}
        className="flex justify-center py-4"
      >
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {summaries.reduce((acc, summary, idx) => {
              const percentage = (summary.grandTotal / grandTotal) * 100;
              const previousPercentages = summaries
                .slice(0, idx)
                .reduce((sum, s) => sum + (s.grandTotal / grandTotal) * 100, 0);
              
              const strokeDasharray = `${percentage} ${100 - percentage}`;
              const strokeDashoffset = -previousPercentages;
              
              acc.push(
                <circle
                  key={summary.participantId}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={summary.participantColor}
                  strokeWidth="20"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500"
                  style={{ 
                    strokeDasharray: `${percentage * 2.51} ${251.2}`,
                    strokeDashoffset: -previousPercentages * 2.51,
                  }}
                />
              );
              return acc;
            }, [] as JSX.Element[])}
          </svg>
        </div>
      </motion.div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3">
        {summaries.map((summary) => (
          <div key={summary.participantId} className="flex items-center gap-1.5 text-sm">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: summary.participantColor }}
            />
            <span className="text-muted-foreground">
              {summary.participantName} ({Math.round((summary.grandTotal / grandTotal) * 100)}%)
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          onClick={prevStep}
          variant="outline"
          className="flex-1 h-12"
          size="lg"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
        <Button
          onClick={handleShare}
          className="flex-1 h-12 font-semibold"
          size="lg"
        >
          {copied ? (
            <>
              <Check className="w-5 h-5 mr-2" />
              Copied!
            </>
          ) : (
            <>
              <Share2 className="w-5 h-5 mr-2" />
              Share
            </>
          )}
        </Button>
      </div>

      <Button
        onClick={handleNewBill}
        variant="ghost"
        className="w-full text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        Start New Bill
      </Button>
    </motion.div>
  );
}
