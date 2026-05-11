import { NextRequest, NextResponse } from 'next/server'
import { getFrankfurterRates } from '@/lib/frankfurter'
import { getMurcRates } from '@/lib/murc'
import { convertAmount, formatNumber } from '@/lib/rates'
import { ConvertRequest, ConvertResponse } from '@/lib/types'

export const runtime = 'nodejs'

function lastBusinessDay(year: number, month: number): string {
  let d = new Date(Date.UTC(year, month, 0)) // last day of month
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return d.toISOString().slice(0, 10)
}

function resolveDate(req: ConvertRequest): string {
  if (req.dateMode === 'day') return req.day
  const y = parseInt(req.year, 10)
  const m = parseInt(req.month, 10)
  if (isNaN(y) || isNaN(m)) return ''
  return lastBusinessDay(y, m)
}

function fmt6(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
}

export async function POST(req: NextRequest) {
  let body: ConvertRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { source, from, to, basis, amount: amountStr, rounding, decimals: decimalsStr } = body

  const amount = parseFloat(String(amountStr).replace(/,/g, ''))
  if (isNaN(amount)) {
    return NextResponse.json<ConvertResponse>({
      result: '-', usedDate: '-', selDate: '-', rateFrom: '-', rateTo: '-',
      rateCross: '-', auditSummary: '-', rateInfo: '-', fallback: '', error: 'Invalid amount',
    })
  }

  const decimals = Math.max(0, Math.min(8, parseInt(String(decimalsStr), 10) || 2))
  const targetDate = resolveDate(body)

  if (!targetDate) {
    return NextResponse.json<ConvertResponse>({
      result: '-', usedDate: '-', selDate: '-', rateFrom: '-', rateTo: '-',
      rateCross: '-', auditSummary: '-', rateInfo: '-', fallback: '', error: 'Invalid date selection',
    })
  }

  try {
    let rateMap: Record<string, Record<string, number | null>>
    let sortedDates: string[]
    let sourceLabel: string

    if (source === 'ecb') {
      const data = await getFrankfurterRates(targetDate)
      if (!data) {
        return NextResponse.json<ConvertResponse>({
          result: '-', usedDate: '-', selDate: targetDate, rateFrom: '-', rateTo: '-',
          rateCross: '-', auditSummary: '-', rateInfo: '-', fallback: '',
          error: `No ECB rate data found for or before ${targetDate}`,
        })
      }
      rateMap = data.rateMap
      sortedDates = data.sortedDates
      sourceLabel = 'ECB Mid'
    } else {
      const data = await getMurcRates(targetDate, basis ?? 'ttm')
      if (!data) {
        return NextResponse.json<ConvertResponse>({
          result: '-', usedDate: '-', selDate: targetDate, rateFrom: '-', rateTo: '-',
          rateCross: '-', auditSummary: '-', rateInfo: '-', fallback: '',
          error: `No MURC rate data found for or before ${targetDate}`,
        })
      }
      rateMap = data.rateMap
      sortedDates = data.sortedDates
      sourceLabel = `MURC ${(basis ?? 'ttm').toUpperCase()}`
    }

    const out = convertAmount(rateMap, sortedDates, from, to, targetDate, amount)
    const resultStr = formatNumber(out.result, decimals, rounding ?? 'half_up')
    const usedDate = out.usedDate ?? '-'
    const cross = out.cross

    const crossStr = cross !== null ? `1 ${from} = ${cross.toFixed(8)} ${to}` : 'N/A'
    const rateFromStr = out.jpyPerFrom !== undefined ? `${fmt6(out.jpyPerFrom)} JPY per 1 ${from}` : 'N/A'
    const rateToStr   = out.jpyPerTo   !== undefined ? `${fmt6(out.jpyPerTo)}   JPY per 1 ${to}`   : 'N/A'

    const summaryRate = cross !== null
      ? cross.toLocaleString('en-US', {
          minimumFractionDigits: to === 'JPY' ? 2 : 6,
          maximumFractionDigits: to === 'JPY' ? 2 : 6,
        })
      : '-'

    const amountFmt = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const auditSummary = `${sourceLabel} | ${usedDate}\n${from} ${amountFmt} @ ${to} ${summaryRate}`
    const rateInfo =
      `Rate basis: ${sourceLabel} | Source: ${source}\n` +
      `From rate: ${from} -> JPY = ${rateFromStr} | Used date: ${out.usedDateFrom ?? '-'}\n` +
      `To rate:   ${to} -> JPY = ${rateToStr} | Used date: ${out.usedDateTo ?? '-'}\n` +
      `Cross: ${crossStr}\n` +
      `(Conversion via JPY pivot: ${from} -> JPY -> ${to})`

    const fallback =
      out.usedDateFrom !== targetDate || out.usedDateTo !== targetDate
        ? `Note: exact date may be missing. Using nearest previous available date(s). Requested: ${targetDate}`
        : ''

    return NextResponse.json<ConvertResponse>({
      result: `${resultStr}  ${to}`,
      usedDate,
      selDate: targetDate,
      rateFrom: rateFromStr,
      rateTo: rateToStr,
      rateCross: crossStr,
      auditSummary,
      rateInfo,
      fallback,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json<ConvertResponse>({
      result: '-', usedDate: '-', selDate: targetDate, rateFrom: '-', rateTo: '-',
      rateCross: '-', auditSummary: '-', rateInfo: msg, fallback: '', error: msg,
    })
  }
}
