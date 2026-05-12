export const COUNTRY: Record<string, string> = {
  AED: 'ae', ARS: 'ar', AUD: 'au', BDT: 'bd', BGN: 'bg',
  BHD: 'bh', BRL: 'br', CAD: 'ca', CHF: 'ch', CLP: 'cl',
  CNY: 'cn', COP: 'co', CZK: 'cz', DKK: 'dk', EGP: 'eg',
  EUR: 'eu', FJD: 'fj', GBP: 'gb', GHS: 'gh', HKD: 'hk',
  HRK: 'hr', HUF: 'hu', IDR: 'id', ILS: 'il', INR: 'in',
  ISK: 'is', JOD: 'jo', JPY: 'jp', KES: 'ke', KHR: 'kh',
  KRW: 'kr', KWD: 'kw', LKR: 'lk', MAD: 'ma', MMK: 'mm',
  MXN: 'mx', MYR: 'my', NGN: 'ng', NOK: 'no', NPR: 'np',
  NZD: 'nz', OMR: 'om', PEN: 'pe', PGK: 'pg', PHP: 'ph',
  PKR: 'pk', PLN: 'pl', QAR: 'qa', RON: 'ro', RUB: 'ru',
  SAR: 'sa', SEK: 'se', SGD: 'sg', THB: 'th', TND: 'tn',
  TRY: 'tr', TWD: 'tw', UAH: 'ua', USD: 'us', VND: 'vn',
  ZAR: 'za',
}

export function flagUrl(code: string): string | null {
  const cc = COUNTRY[code]
  return cc ? `https://flagcdn.com/w20/${cc}.png` : null
}
