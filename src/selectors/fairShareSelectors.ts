import type { Bill } from '@/types/bill';
function splitCents(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0) {
    return weights.map(() => 0);
  }
  const base = weights.map(w => Math.floor((total * w) / weightSum));
  let remainder = total - base.reduce((sum, v) => sum + v, 0);
  let i = 0;
  while (remainder > 0) {
    base[i % base.length] += 1;
    remainder -= 1;
    i += 1;
  }
  return base;
}

export function getFairShareCentsByReceipt(bill: Bill): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const participants = bill.participants;

  const receipts = bill.receipts || [];
  receipts.forEach(receipt => {
    const receiptId = receipt.id;
    const receiptMap: Record<string, number> = {};
    participants.forEach(p => { receiptMap[p.id] = 0; });

    // Item shares
    const receiptItems = bill.items.filter(item => item.receiptId === receiptId);
    receiptItems.forEach(item => {
      const lineTotalCents = item.lineTotalMinor;
      const assignees = item.assignees.length > 0
        ? item.assignees
        : participants.map(p => ({ participantId: p.id, shareCount: 1 }));
      const weights = assignees.map(a => a.shareCount);
      const splits = splitCents(lineTotalCents, weights);
      assignees.forEach((a, idx) => {
        receiptMap[a.participantId] = (receiptMap[a.participantId] || 0) + splits[idx];
      });
    });


    result[receiptId] = receiptMap;
  });

  return result;
}
