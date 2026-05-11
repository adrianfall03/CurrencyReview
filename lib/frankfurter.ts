import { unstable_cache } from 'next/cache'
import { RateMap } from './rates'

// Frankfurter publishes ECB (European Central Bank) official mid rates.
// Endpoint: https://api.frankfurter.app
// base=JPY returns: { date, rates: { USD: 0.00671, EUR: 0.00622, ... } }
// meaning "1 JPY buys X units of foreign currency".
// We invert to get "JPY per 1 unit of foreign currency" for the conversion engine.

export interface FrankfurterDayData {
  rateMap: RateMap   // { [date]: { [currency]: jpyPerUnit } }
  sortedDates: string[]
  usedDate: string
}

async function _fetchDay(date: string): Promise<{ [currency: string]: number | null }> {
  const url = `https://api.frankfurter.app/${date}?base=JPY`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: false }, // historical rates never change
  })

  if (res.status === 404) return {} // weekend / holiday — no data for that date
  if (!res.ok) throw new Error(`Frankfurter API error: HTTP ${res.status}`)

  const json = await res.json()
  const rawRates: Record<string, number> = json.rates ?? {}

  const row: { [currency: string]: number | null } = {}
  for (const [code, rateFromJpy] of Object.entries(rawRates)) {
    // rateFromJpy = units of `code` per 1 JPY  →  invert to get JPY per 1 `code`
    row[code] = rateFromJpy > 0 ? 1 / rateFromJpy : null
  }
  return row
}

function getCachedDay(date: string) {
  return unstable_cache(() => _fetchDay(date), [`ecb-day-${date}`], {
    revalidate: false,
  })()
}

/**
 * Fetch ECB rates for a target date, walking back up to 7 days for weekends/holidays.
 */
export async function getFrankfurterRates(targetDate: string): Promise<FrankfurterDayData | null> {
  const target = new Date(targetDate + 'T00:00:00Z')

  for (let i = 0; i < 7; i++) {
    const d = new Date(target)
    d.setUTCDate(d.getUTCDate() - i)
    const dow = d.getUTCDay()
    if (dow === 0 || dow === 6) continue // ECB doesn't publish on weekends

    const dateStr = d.toISOString().slice(0, 10)
    const row = await getCachedDay(dateStr)
    if (Object.keys(row).length === 0) continue

    const rateMap: RateMap = { [dateStr]: row }
    return { rateMap, sortedDates: [dateStr], usedDate: dateStr }
  }

  return null
}

// Static currency list from Frankfurter (changes rarely — cache aggressively)
async function _fetchCurrencies(): Promise<string[]> {
  const res = await fetch('https://api.frankfurter.app/currencies', {
    next: { revalidate: 86400 * 7 },
  })
  if (!res.ok) throw new Error(`Frankfurter currencies error: ${res.status}`)
  const json: Record<string, string> = await res.json()
  const codes = Object.keys(json).filter((c) => c !== 'JPY').sort()
  return ['JPY', ...codes]
}

export const getFrankfurterCurrencies = unstable_cache(
  _fetchCurrencies,
  ['ecb-currencies'],
  { revalidate: 86400 * 7 }
)
