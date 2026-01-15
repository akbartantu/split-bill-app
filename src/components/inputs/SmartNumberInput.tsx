import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';

type SmartNumberMode = 'percent' | 'money';

interface SmartNumberInputProps {
  value: number;
  mode: SmartNumberMode;
  decimals?: number;
  onChangeValue: (value: number) => void;
  placeholder?: string;
  className?: string;
}

const patterns: Record<SmartNumberMode, RegExp> = {
  percent: /^\d{0,3}(\.\d{0,2})?$/,
  money: /^\d{0,7}(\.\d{0,2})?$/,
};

function formatValue(value: number, mode: SmartNumberMode, decimals: number): string {
  if (Number.isNaN(value)) return '';
  if (mode === 'percent') {
    return value.toFixed(2);
  }
  return value.toFixed(decimals);
}

function parseDraft(draft: string): number | null {
  if (draft.trim() === '') return null;
  if (draft.endsWith('.')) return null;
  const parsed = Number(draft);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function SmartNumberInput({
  value,
  mode,
  decimals = 2,
  onChangeValue,
  placeholder,
  className,
}: SmartNumberInputProps) {
  const [draft, setDraft] = useState(value ? formatValue(value, mode, decimals) : '');
  const [isFocused, setIsFocused] = useState(false);
  const pattern = useMemo(() => {
    if (mode === 'percent') return patterns.percent;
    return decimals === 0 ? /^\d*$/ : new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`);
  }, [mode, decimals]);

  useEffect(() => {
    if (!isFocused) {
      setDraft(value ? formatValue(value, mode, decimals) : '');
    }
  }, [value, mode, decimals, isFocused]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        setIsFocused(false);
        const parsed = parseDraft(e.target.value);
        if (parsed !== null) {
          const formatted = formatValue(parsed, mode, decimals);
          setDraft(formatted);
          onChangeValue(parsed);
        } else {
          setDraft('');
        }
      }}
      onChange={(e) => {
        const next = e.target.value;
        if (!pattern.test(next)) {
          return;
        }
        setDraft(next);
        const parsed = parseDraft(next);
        if (parsed !== null) {
          onChangeValue(parsed);
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}
