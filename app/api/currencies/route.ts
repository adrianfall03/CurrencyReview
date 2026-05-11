import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getMizuhoData } from '@/lib/mizuho'
import { getFrankfurterCurrencies } from '@/lib/frankfurter'
import { getMurcCurrencies } from '@/lib/murc'
import { CurrenciesResponse } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') ?? 'mizuho'
  const refresh = searchParams.get('refresh') === 'true'

  try {
    if (source === 'mizuho') {
      if (refresh) revalidateTag('mizuho-rates')
      const data = await getMizuhoData()
      const years = [...new Set(data.sortedDates.map((d) => d.slice(0, 4)))].sort()
      const res: CurrenciesResponse = {
        currencies: data.currencies,
        minDate: data.minDate,
        maxDate: data.maxDate,
        years,
      }
      return NextResponse.json(res)
    }

    if (source === 'ecb') {
      const currencies = await getFrankfurterCurrencies()
      const today = new Date().toISOString().slice(0, 10)
      const years: string[] = []
      for (let y = 1999; y <= new Date().getFullYear(); y++) years.push(String(y))
      const res: CurrenciesResponse = { currencies, minDate: '1999-01-04', maxDate: today, years }
      return NextResponse.json(res)
    }

    if (source === 'murc') {
      const currencies = await getMurcCurrencies()
      const today = new Date().toISOString().slice(0, 10)
      const years: string[] = []
      for (let y = 2014; y <= new Date().getFullYear(); y++) years.push(String(y))
      const res: CurrenciesResponse = { currencies, minDate: '2014-01-01', maxDate: today, years }
      return NextResponse.json(res)
    }

    return NextResponse.json({ error: 'Unknown source' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
