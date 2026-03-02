import { Input } from '@/components/ui/input';
import { getCurrencyDecimals } from '@/lib/currency';
import { fromMinor, parseMoney, toMinor } from '@/lib/money';
import { useEffect, useState } from 'react';

interface MoneyInputProps {
  valueMinor: number;
  currencyCode: string;
  onChangeMinor: (valueMinor: number) => void;
  placeholder?: string;
  className?: string;
  inputId?: string;
}

export function MoneyInput({
  valueMinor,
  currencyCode,
  onChangeMinor,
  placeholder,
  className,
  inputId,
}: MoneyInputProps) {
  const decimals = getCurrencyDecimals(currencyCode);
  const [draft, setDraft] = useState(fromMinor(valueMinor, currencyCode).toFixed(decimals));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(fromMinor(valueMinor, currencyCode).toFixed(decimals));
    }
  }, [valueMinor, currencyCode, decimals, isFocused]);

  return (
    <Input
      id={inputId}
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={() => setIsFocused(true)}
      onChange={(e) => {
        const next = e.target.value;
        const parsed = parseMoney(next, decimals);
        if (parsed === null && next !== '' && !next.endsWith('.')) {
          return;
        }
        setDraft(next);
        if (parsed !== null) {
          onChangeMinor(toMinor(parsed, currencyCode));
        }
      }}
      onBlur={(e) => {
        setIsFocused(false);
        const parsed = parseMoney(e.target.value, decimals);
        if (parsed !== null) {
          const minor = toMinor(parsed, currencyCode);
          onChangeMinor(minor);
          setDraft(fromMinor(minor, currencyCode).toFixed(decimals));
        } else if (e.target.value === '') {
          setDraft('');
        } else {
          setDraft(fromMinor(valueMinor, currencyCode).toFixed(decimals));
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}
