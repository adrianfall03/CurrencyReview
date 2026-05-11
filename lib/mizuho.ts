import { unstable_cache } from 'next/cache'
import { RateMap } from './rates'

export interface MizuhoData {
  rateMap: RateMap
  currencies: string[]
  sortedDates: string[]
  minDate: string
  maxDate: string
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/[.\-/]/g, '/')
  const parts = s.split('/')
  if (parts.length !== 3) return null
  const [y, m, d] = parts.map((p) => parseInt(p, 10))
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
}

function parseMizuhoCSV(text: string): MizuhoData {
  // Normalize line endings
  const lines = text.split(/\r?\n/)

  // Find the header row (first row with a comma-separated date-like first column)
  // Original Python: skiprows=2, header=0 → rows 0,1 skipped, row 2 is header, rows 3+ are data
  let headerIdx = -1
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = lines[i].split(',')
    // Header has many columns (>5) and the first cell is date-like or a label
    if (cols.length > 5) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) throw new Error('Could not find CSV header')

  const headerCols = lines[headerIdx]
    .split(',')
    .map((h) => h.trim().replace(/^["']+|["']+$/g, ''))

  // Build column groups: handle ".1" duplicate suffix like Python does
  const groups: { [base: string]: number[] } = {}
  for (let i = 1; i < headerCols.length; i++) {
    const col = headerCols[i]
    if (!col) continue
    const base = col.endsWith('.1') ? col.slice(0, -2) : col
    if (!groups[base]) groups[base] = []
    groups[base].push(i)
  }

  const rateMap: RateMap = {}
  const dateSet = new Set<string>()
  const currencySet = new Set<string>()

  for (let r = headerIdx + 1; r < lines.length; r++) {
    const line = lines[r].trim()
    if (!line) continue
    const cols = line.split(',').map((v) => v.trim().replace(/^["']+|["']+$/g, ''))
    if (cols.length < 2) continue

    const dateStr = normalizeDate(cols[0])
    if (!dateStr) continue

    const rates: { [currency: string]: number | null } = {}
    for (const [base, indices] of Object.entries(groups)) {
      let val: number | null = null
      for (const idx of indices) {
        const raw = cols[idx] ?? ''
        if (!raw) continue
        const n = parseFloat(raw)
        if (!isNaN(n)) {
          val = n
          break
        }
      }
      rates[base] = val
      if (val !== null) currencySet.add(base)
    }

    rateMap[dateStr] = rates
    dateSet.add(dateStr)
  }

  const sortedDates = Array.from(dateSet).sort()
  const currencies = ['JPY', ...Array.from(currencySet).sort()]

  return {
    rateMap,
    currencies,
    sortedDates,
    minDate: sortedDates[0] ?? '',
    maxDate: sortedDates[sortedDates.length - 1] ?? '',
  }
}

async function _fetchMizuho(): Promise<MizuhoData> {
  const url = 'https://www.mizuhobank.co.jp/market/quote.csv'

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://www.mizuhobank.co.jp/market/index.html',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
    next: { revalidate: 86400, tags: ['mizuho-rates'] },
  })

  if (!res.ok) {
    throw new Error(
      `Mizuho server returned HTTP ${res.status}. The server may be blocking automated requests. ` +
        `Please try again later.`
    )
  }

  const buffer = await res.arrayBuffer()

  for (const enc of ['shift-jis', 'utf-8-sig', 'utf-8'] as const) {
    try {
      const text = new TextDecoder(enc).decode(buffer)
      if (text.length > 100 && text.includes(',')) {
        return parseMizuhoCSV(text)
      }
    } catch {
      continue
    }
  }

  throw new Error('Failed to decode Mizuho CSV — unsupported encoding')
}

export const getMizuhoData = unstable_cache(_fetchMizuho, ['mizuho-rates'], {
  revalidate: 86400,
  tags: ['mizuho-rates'],
})
