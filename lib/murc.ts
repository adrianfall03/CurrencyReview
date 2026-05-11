import { unstable_cache } from 'next/cache'
import { RateBasis } from './types'
import { RateMap } from './rates'

export interface MurcDayRates {
  [currency: string]: { tts: number | null; ttb: number | null; ttm: number | null }
}

function parseMurcHtml(html: string): MurcDayRates {
  const result: MurcDayRates = {}

  // Find table.data-table7
  const tableMatch = html.match(
    /<table[^>]*class="[^"]*data-table7[^"]*"[^>]*>([\s\S]*?)<\/table>/i
  )
  if (!tableMatch) return result

  const tableHtml = tableMatch[1]
  const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? []
    if (cells.length < 6) continue

    const getText = (s: string) =>
      s
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim()

    const cellTexts = cells.map(getText)
    const code = (cellTexts[2] ?? '').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) continue

    const parseF = (s: string): number | null => {
      const clean = s.replace(/,/g, '').trim()
      if (!clean || clean.toLowerCase() === 'unquoted') return null
      const n = parseFloat(clean)
      return isNaN(n) ? null : n
    }

    const tts = parseF(cellTexts[3] ?? '')
    const ttb = parseF(cellTexts[4] ?? '')
    const ttm = tts !== null && ttb !== null ? (tts + ttb) / 2 : null

    result[code] = { tts, ttb, ttm }
  }

  return result
}

async function _fetchMurcDay(date: string): Promise<MurcDayRates> {
  const parts = date.split('-')
  if (parts.length !== 3) return {}
  const [year, month, day] = parts
  const yy = year.slice(2)
  const id = `${yy}${month}${day}`

  const url = `https://www.murc-kawasesouba.jp/fx/past/index.php?id=${id}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FXConverter/2.0)' },
    next: { revalidate: false }, // historical data never changes
  })

  if (!res.ok) return {}

  const buffer = await res.arrayBuffer()
  // MURC pages are encoded in Shift-JIS (cp932)
  let html: string
  try {
    html = new TextDecoder('shift-jis').decode(buffer)
  } catch {
    html = new TextDecoder('utf-8').decode(buffer)
  }

  return parseMurcHtml(html)
}

function getMurcDayCached(date: string) {
  return unstable_cache(() => _fetchMurcDay(date), [`murc-day-${date}`], {
    revalidate: false,
  })()
}

/**
 * Fetch MURC rates for a target date, walking back up to 7 days to find data.
 * Returns the found date and a flat RateMap usable by the conversion engine.
 */
export async function getMurcRates(
  targetDate: string,
  basis: RateBasis
): Promise<{ rateMap: RateMap; sortedDates: string[]; usedDate: string } | null> {
  const target = new Date(targetDate + 'T00:00:00Z')

  for (let i = 0; i < 7; i++) {
    const d = new Date(target)
    d.setUTCDate(d.getUTCDate() - i)
    const dow = d.getUTCDay()
    if (dow === 0 || dow === 6) continue // skip weekends

    const dateStr = d.toISOString().slice(0, 10)
    const dayRates = await getMurcDayCached(dateStr)
    if (Object.keys(dayRates).length === 0) continue

    // Build a flat rateMap: { [date]: { [currency]: rate } }
    const row: { [currency: string]: number | null } = {}
    for (const [code, vals] of Object.entries(dayRates)) {
      row[code] = vals[basis] ?? null
    }

    const rateMap: RateMap = { [dateStr]: row }
    return { rateMap, sortedDates: [dateStr], usedDate: dateStr }
  }

  return null
}

export async function getMurcCurrencies(): Promise<string[]> {
  const today = new Date()
  for (let i = 0; i < 10; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue

    const dateStr = d.toISOString().slice(0, 10)
    const data = await getMurcDayCached(dateStr)
    const currencies = Object.keys(data).sort()
    if (currencies.length > 0) return ['JPY', ...currencies]
  }

  // Fallback to known major MURC currencies
  return [
    'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP',
    'HKD', 'KRW', 'MXN', 'NZD', 'SGD', 'THB', 'USD', 'ZAR',
  ]
}
