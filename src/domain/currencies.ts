/**
 * ISO 4217 currency codes in circulation (2026), for checking a code that arrived from outside —
 * an AI-written activity file (2C). Hermes has no `Intl.supportedValuesOf('currency')` (the same
 * gap as time zones, CLAUDE.md finding 3), hence a list. The item form still takes any three
 * letters, so an unknown code is a warning on import, never a refusal.
 */

const CODES = `
AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN
BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS
GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW
KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD
NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD
SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES
VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG
`;

const KNOWN = new Set(CODES.trim().split(/\s+/));

/** Three capital letters — the shape every stored currency has. */
export const CURRENCY_CODE = /^[A-Z]{3}$/;

export function isKnownCurrency(code: string): boolean {
  return KNOWN.has(code);
}

/** ISO 4217 currencies with no minor unit: shown without decimals, converted to whole units. */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV',
  'XAF', 'XOF', 'XPF',
]);

/** Decimals a currency is shown with: 0 for yen and the like, else 2. */
export function currencyDecimals(code: string): 0 | 2 {
  return ZERO_DECIMAL.has(code) ? 0 : 2;
}
