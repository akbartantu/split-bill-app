export function scrollToReceipt(receiptId: string) {
  const el = document.getElementById(`receipt-${receiptId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
