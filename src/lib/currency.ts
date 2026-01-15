export interface CurrencyConfig {
  code: string;
  symbol: string;
  decimals: number;
  locale: string;
}

export const supportedCurrencies: CurrencyConfig[] = [
  { code: 'USD', symbol: '$', decimals: 2, locale: 'en-US' },
  { code: 'AUD', symbol: 'A$', decimals: 2, locale: 'en-AU' },
  { code: 'EUR', symbol: '€', decimals: 2, locale: 'de-DE' },
  { code: 'GBP', symbol: '£', decimals: 2, locale: 'en-GB' },
  { code: 'SGD', symbol: 'S$', decimals: 2, locale: 'en-SG' },
  { code: 'IDR', symbol: 'Rp', decimals: 2, locale: 'id-ID' },
  { code: 'JPY', symbol: '¥', decimals: 0, locale: 'ja-JP' },
];

export function getCurrencyConfig(code: string): CurrencyConfig {
  return supportedCurrencies.find(c => c.code === code) || supportedCurrencies[0];
}

export function getCurrencyDecimals(code: string): number {
  return getCurrencyConfig(code).decimals;
}

export function formatMoneyMinor(
  amountMinor: number,
  code: string,
  locale?: string
): string {
  const config = getCurrencyConfig(code);
  const value = amountMinor / Math.pow(10, config.decimals);
  return new Intl.NumberFormat(locale || config.locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  }).format(value);
}

export function parseMoneyToMinor(
  input: string,
  code: string
): number | null {
  const config = getCurrencyConfig(code);
  const decimals = config.decimals;
  const regex = decimals === 0
    ? /^\d*$/
    : new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`);

  if (!regex.test(input)) return null;
  if (input.trim() === '' || input.endsWith('.')) return null;
  const parsed = Number(input);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * Math.pow(10, decimals));
}
