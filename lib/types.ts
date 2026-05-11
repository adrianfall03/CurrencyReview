export type Source = 'mizuho' | 'murc'
export type RateBasis = 'ttm' | 'tts' | 'ttb'
export type RoundingMode = 'half_up' | 'up' | 'down'
export type DateMode = 'day' | 'month'

export interface CurrenciesResponse {
  currencies: string[]
  minDate: string
  maxDate: string
  years: string[]
}

export interface ConvertRequest {
  source: Source
  from: string
  to: string
  dateMode: DateMode
  day: string
  year: string
  month: string
  basis: RateBasis
  amount: string
  rounding: RoundingMode
  decimals: string
}

export interface ConvertResponse {
  result: string
  usedDate: string
  selDate: string
  rateFrom: string
  rateTo: string
  rateCross: string
  auditSummary: string
  rateInfo: string
  fallback: string
  error?: string
}
