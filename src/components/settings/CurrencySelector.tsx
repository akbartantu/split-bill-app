import { useState } from 'react';
import { useBillStore } from '@/store/billStore';
import { supportedCurrencies } from '@/lib/currency';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export function CurrencySelector() {
  const { currentBill, setCurrencyCode } = useBillStore();
  const [hasWarned, setHasWarned] = useState(false);
  const currencyCode = currentBill.currencyCode || currentBill.currency || 'USD';

  return (
    <Select
      value={currencyCode}
      onValueChange={(code) => {
        setCurrencyCode(code);
        if (!hasWarned) {
          toast.message('Currency display changed. Amounts were not converted.');
          setHasWarned(true);
        }
      }}
    >
      <SelectTrigger className="h-8 w-[110px] text-xs">
        <SelectValue placeholder="Currency" />
      </SelectTrigger>
      <SelectContent>
        {supportedCurrencies.map(c => (
          <SelectItem key={c.code} value={c.code}>
            {c.code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
