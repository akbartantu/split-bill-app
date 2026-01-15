/**
 * Money parsing helpers (currency-aware)
 */
import { getCurrencyDecimals } from '@/lib/currency';

export function isValidMoneyInput(value: string, decimals: number): boolean {
  const pattern = decimals === 0 ? /^\d*$/ : new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`);
  return pattern.test(value);
}

export function parseMoney(value: string, decimals: number): number | null {
  if (value.trim() === '') return null;
  if (!isValidMoneyInput(value, decimals)) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function toMinor(value: number, currencyCode: string): number {
  const decimals = getCurrencyDecimals(currencyCode);
  return Math.round(value * Math.pow(10, decimals));
}

export function fromMinor(value: number, currencyCode: string): number {
  const decimals = getCurrencyDecimals(currencyCode);
  return value / Math.pow(10, decimals);
}

// Legacy helpers (2-decimal currencies)
export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function fromCents(value: number): number {
  return value / 100;
}
