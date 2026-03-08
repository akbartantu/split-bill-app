/**
 * Minimal split calculator for Telegram bot: one receipt, item-level assignments, one payer.
 * Returns net owed per person and settle-up transfers.
 */

function splitCents(totalMinor: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const base = weights.map((w) => Math.floor((totalMinor * w) / sum));
  let rem = totalMinor - base.reduce((a, b) => a + b, 0);
  let i = 0;
  while (rem > 0) {
    base[i % base.length] += 1;
    rem -= 1;
    i += 1;
  }
  return base;
}

export interface BotParticipant {
  id: string;
  name: string;
}

export interface BotItemAssignment {
  /** participant ids who share this item (equal split among them) */
  participantIds: string[];
}

export interface BotSplitInput {
  participants: BotParticipant[];
  items: { totalPrice: number }[];
  assignments: BotItemAssignment[];
  payerId: string;
  totalPaidMinor: number;
}

export interface BotTransfer {
  fromId: string;
  toId: string;
  amountMinor: number;
}

export interface BotSplitResult {
  fairShareMinor: Record<string, number>;
  netOwedMinor: Record<string, number>;
  transfers: BotTransfer[];
}

export function calculateBotSplit(input: BotSplitInput): BotSplitResult {
  const { participants, items, assignments, payerId, totalPaidMinor } = input;
  const fairShareMinor: Record<string, number> = {};
  participants.forEach((p) => (fairShareMinor[p.id] = 0));

  items.forEach((item, idx) => {
    const ass = assignments[idx];
    const ids = ass?.participantIds?.length ? ass.participantIds : participants.map((p) => p.id);
    const weights = ids.map(() => 1);
    const totalMinor = Math.round((item.totalPrice ?? 0) * 100);
    const splits = splitCents(totalMinor, weights);
    ids.forEach((id, i) => {
      fairShareMinor[id] = (fairShareMinor[id] || 0) + (splits[i] ?? 0);
    });
  });

  const paidMinor: Record<string, number> = {};
  participants.forEach((p) => (paidMinor[p.id] = p.id === payerId ? totalPaidMinor : 0));

  const netOwedMinor: Record<string, number> = {};
  participants.forEach((p) => {
    netOwedMinor[p.id] = (fairShareMinor[p.id] || 0) - (paidMinor[p.id] || 0);
  });

  const debtors = participants.filter((p) => (netOwedMinor[p.id] || 0) > 0).map((p) => p.id);
  const creditors = participants.filter((p) => (netOwedMinor[p.id] || 0) < 0).map((p) => p.id);
  const balances = { ...netOwedMinor };
  const transfers: BotTransfer[] = [];
  let di = 0,
    ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const fromId = debtors[di];
    const toId = creditors[ci];
    const pay = Math.min(balances[fromId] || 0, -(balances[toId] || 0));
    if (pay <= 0) {
      ci++;
      continue;
    }
    transfers.push({ fromId, toId, amountMinor: pay });
    balances[fromId] = (balances[fromId] || 0) - pay;
    balances[toId] = (balances[toId] || 0) + pay;
    if ((balances[fromId] || 0) <= 0) di++;
    if ((balances[toId] || 0) >= 0) ci++;
  }

  return { fairShareMinor, netOwedMinor, transfers };
}
