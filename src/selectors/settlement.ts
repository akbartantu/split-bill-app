import type { Bill } from '@/types/bill';
export interface Transfer {
  fromId: string;
  toId: string;
  amountMinor: number;
}

function generateTransfers(
  netByPerson: Record<string, number>,
  participantOrder: string[]
): Transfer[] {
  const creditors = participantOrder
    .map(id => ({ id, amount: netByPerson[id] || 0 }))
    .filter(p => p.amount > 0);
  const debtors = participantOrder
    .map(id => ({ id, amount: -(netByPerson[id] || 0) }))
    .filter(p => p.amount > 0);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    transfers.push({
      fromId: debtors[i].id,
      toId: creditors[j].id,
      amountMinor: pay,
    });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i += 1;
    if (creditors[j].amount === 0) j += 1;
  }
  return transfers;
}

export function getSettlementFromNet(
  netByPerson: Record<string, number>,
  participantOrder: string[]
): Transfer[] {
  return generateTransfers(netByPerson, participantOrder);
}
