import { unstable_cache } from 'next/cache'
import { list } from '@vercel/blob'
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
  const lines = text.split(/\r?\n/)

  const parseRow = (line: string) =>
    line.split(',').map((h) => h.trim().replace(/^["']+|["']+$/g, ''))

  // Mizuho CSVs have a two-row header:
  //   Row N:   "年月日, 参考相場, 参考相場, ..."  (group label, Japanese text)
  //   Row N+1: "",      USD,       EUR,       ...  (actual ISO currency codes)
  // Strategy: find the first row that contains 3+ ISO currency codes (2-4 uppercase letters).
  // Fall back to the first multi-column row if none is found.
  let headerIdx = -1
  let firstMultiColIdx = -1
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const cols = parseRow(lines[i])
    if (cols.length <= 5) continue
    if (firstMultiColIdx < 0) firstMultiColIdx = i
    const isoCodes = cols.filter((c) => /^[A-Z]{2,4}$/.test(c))
    if (isoCodes.length >= 3) { headerIdx = i; break }
  }
  if (headerIdx < 0) headerIdx = firstMultiColIdx
  if (headerIdx < 0) throw new Error('Could not find CSV header')

  const headerCols = parseRow(lines[headerIdx])

  // Group duplicate ".1" columns (Mizuho CSV convention).
  // Also normalize unit-quoted headers like "KRW(100)" → key "KRW", divisor 100.
  const groups: { [base: string]: { indices: number[]; divisor: number } } = {}
  for (let i = 1; i < headerCols.length; i++) {
    const col = headerCols[i]
    if (!col) continue
    // Strip optional ".1" duplicate suffix first
    const raw = col.endsWith('.1') ? col.slice(0, -2) : col
    // Parse optional unit suffix, e.g. "KRW(100)"
    const unitMatch = raw.match(/^([A-Z]{2,4})\((\d+)\)$/)
    const base    = unitMatch ? unitMatch[1] : raw
    const divisor = unitMatch ? parseInt(unitMatch[2], 10) : 1
    if (!groups[base]) groups[base] = { indices: [], divisor }
    groups[base].indices.push(i)
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
    for (const [base, { indices, divisor }] of Object.entries(groups)) {
      let val: number | null = null
      for (const idx of indices) {
        const raw = cols[idx] ?? ''
        if (!raw) continue
        const n = parseFloat(raw)
        if (!isNaN(n)) { val = n; break }
      }
      rates[base] = val !== null ? val / divisor : null
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
  let blobs: Awaited<ReturnType<typeof list>>['blobs']
  try {
    ;({ blobs } = await list({ prefix: 'mizuho-quote' }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('No token found') || msg.includes('BLOB_READ_WRITE_TOKEN')) {
      throw new Error(
        'Vercel Blob is not configured. ' +
        'Go to your Vercel project → Storage → Create Blob store, ' +
        'then add BLOB_READ_WRITE_TOKEN to your environment variables and redeploy.'
      )
    }
    throw e
  }

  if (blobs.length === 0) {
    throw new Error(
      'Mizuho CSV not found in Blob storage. ' +
      'Please trigger the GitHub Actions workflow "Fetch Mizuho CSV" manually from the Actions tab.'
    )
  }

  // Use the most recently uploaded file
  const latest = blobs.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0]

  const res = await fetch(latest.url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Blob fetch failed: HTTP ${res.status}`)

  const buffer = await res.arrayBuffer()

  for (const enc of ['shift-jis', 'utf-8-sig', 'utf-8'] as const) {
    try {
      const text = new TextDecoder(enc).decode(buffer)
      if (text.length > 100 && text.includes(',')) return parseMizuhoCSV(text)
    } catch { continue }
  }

  throw new Error('Failed to decode Mizuho CSV')
}

export const getMizuhoData = unstable_cache(_fetchMizuho, ['mizuho-blob-rates'], {
  revalidate: 3600, // re-check Blob every hour; GitHub Actions uploads daily
  tags: ['mizuho-rates'],
})
