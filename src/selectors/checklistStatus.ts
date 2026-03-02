import type { Bill } from '@/types/bill';
import { getReceiptStatuses } from '@/selectors/receiptStatus';

export interface ChecklistStatus {
  peopleReady: boolean;
  receiptsReady: boolean;
  itemsAssigned: boolean;
  payerReady: boolean;
  settlementReady: boolean;
  missingPayerReceiptIds: string[];
  unassignedItemCount: number;
}

export function getChecklistStatus(bill: Bill): ChecklistStatus {
  const statuses = getReceiptStatuses(bill);
  const peopleReady = bill.participants.length >= 1;
  const receiptsReady = (bill.receipts?.length || 0) > 0;
  const unassignedItemCount = bill.items.filter(item => item.assignees.length === 0).length;
  const itemsAssigned = bill.items.length === 0 ? false : unassignedItemCount === 0;
  const missingPayerReceiptIds = statuses
    .filter(status => status.missingPayer)
    .map(status => status.receiptId);
  const payerReady = missingPayerReceiptIds.length === 0 && receiptsReady;
  const settlementReady = payerReady && peopleReady && receiptsReady;

  return {
    peopleReady,
    receiptsReady,
    itemsAssigned,
    payerReady,
    settlementReady,
    missingPayerReceiptIds,
    unassignedItemCount,
  };
}
