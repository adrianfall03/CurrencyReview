import { RoundingMode } from './types'

export type RateMap = { [date: string]: { [currency: string]: number | null } }

export function parseScale(currency: string): number {
  const upper = currency.toUpperCase()
  if (upper === 'KRW' || upper === 'IDR' || upper.includes('(100)')) return 100
  return 1
}

export function findBestDate(sortedDates: string[], target: string): string | null {
  let best: string | null = null
  for (const d of sortedDates) {
    if (d <= target) best = d
    else break
  }
  return best
}

export function getJpyPerUnit(
  rateMap: RateMap,
  sortedDates: string[],
  currency: string,
  targetDate: string
): { rate: number | null; usedDate: string | null } {
  if (currency === 'JPY') return { rate: 1, usedDate: targetDate }

  const startDate = findBestDate(sortedDates, targetDate)
  if (!startDate) return { rate: null, usedDate: null }

  const startIdx = sortedDates.indexOf(startDate)
  for (let i = startIdx; i >= 0; i--) {
    const d = sortedDates[i]
    const row = rateMap[d]
    if (!row) continue
    const raw = row[currency]
    if (raw !== null && raw !== undefined && !isNaN(raw)) {
      const scale = parseScale(currency)
      return { rate: raw / scale, usedDate: d }
    }
  }

  return { rate: null, usedDate: startDate }
}

export interface ConversionOutput {
  result: number
  usedDate: string | null
  usedDateFrom: string | null
  usedDateTo: string | null
  jpyPerFrom: number
  jpyPerTo: number
  cross: number | null
}

export function convertAmount(
  rateMap: RateMap,
  sortedDates: string[],
  from: string,
  to: string,
  targetDate: string,
  amount: number
): ConversionOutput {
  let amtJpy: number
  let usedDateFrom: string | null
  let jpyPerFrom: number

  if (from === 'JPY') {
    amtJpy = amount
    usedDateFrom = targetDate
    jpyPerFrom = 1
  } else {
    const { rate, usedDate } = getJpyPerUnit(rateMap, sortedDates, from, targetDate)
    if (rate === null) throw new Error(`No rate found for ${from} on or before ${targetDate}`)
    jpyPerFrom = rate
    usedDateFrom = usedDate
    amtJpy = amount * rate
  }

  let result: number
  let usedDateTo: string | null
  let jpyPerTo: number

  if (to === 'JPY') {
    result = amtJpy
    usedDateTo = targetDate
    jpyPerTo = 1
  } else {
    const { rate, usedDate } = getJpyPerUnit(rateMap, sortedDates, to, targetDate)
    if (rate === null) throw new Error(`No rate found for ${to} on or before ${targetDate}`)
    jpyPerTo = rate
    usedDateTo = usedDate
    result = amtJpy / rate
  }

  const cross = jpyPerTo !== 0 ? jpyPerFrom / jpyPerTo : null
  const usedDate =
    usedDateFrom && usedDateTo
      ? usedDateFrom < usedDateTo
        ? usedDateFrom
        : usedDateTo
      : usedDateFrom ?? usedDateTo

  return { result, usedDate, usedDateFrom, usedDateTo, jpyPerFrom, jpyPerTo, cross }
}

export function formatNumber(n: number, decimals: number, rounding: RoundingMode): string {
  const factor = Math.pow(10, decimals)
  let rounded: number
  if (rounding === 'half_up') {
    rounded = Math.round(n * factor) / factor
  } else if (rounding === 'up') {
    rounded = Math.ceil(n * factor) / factor
  } else {
    rounded = Math.floor(n * factor) / factor
  }
  if (rounded === 0) rounded = 0
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
