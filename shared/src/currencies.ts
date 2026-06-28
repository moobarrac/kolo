// Currency reference data. minor_unit_digits drives all rounding (§3).
// Storage is always integer minor units; this table is how display & rounding
// know the scale for each currency.

export interface CurrencyDef {
  code: string; // ISO-4217
  name: string;
  symbol: string;
  minorUnitDigits: number;
}

export const CURRENCIES: Record<string, CurrencyDef> = {
  NGN: { code: "NGN", name: "Nigerian Naira", symbol: "₦", minorUnitDigits: 2 },
  USD: { code: "USD", name: "US Dollar", symbol: "$", minorUnitDigits: 2 },
  EUR: { code: "EUR", name: "Euro", symbol: "€", minorUnitDigits: 2 },
  GBP: { code: "GBP", name: "Pound Sterling", symbol: "£", minorUnitDigits: 2 },
  XOF: { code: "XOF", name: "West African CFA Franc", symbol: "CFA", minorUnitDigits: 0 },
  EGP: { code: "EGP", name: "Egyptian Pound", symbol: "E£", minorUnitDigits: 2 },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", minorUnitDigits: 0 },
};

export function minorUnitDigits(code: string): number {
  return CURRENCIES[code]?.minorUnitDigits ?? 2;
}

export function currencySymbol(code: string): string {
  return CURRENCIES[code]?.symbol ?? code;
}
