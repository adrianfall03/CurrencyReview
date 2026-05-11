import { NextRequest, NextResponse } from 'next/server'
import { getFrankfurterCurrencies } from '@/lib/frankfurter'
import { getMurcCurrencies } from '@/lib/murc'
import { CurrenciesResponse } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') ?? 'ecb'

  try {
    if (source === 'ecb') {
      const currencies = await getFrankfurterCurrencies()
      const today = new Date().toISOString().slice(0, 10)
      // ECB data goes back to 1999-01-04
      const minDate = '1999-01-04'
      const years: string[] = []
      for (let y = 1999; y <= new Date().getFullYear(); y++) years.push(String(y))

      const res: CurrenciesResponse = { currencies, minDate, maxDate: today, years }
      return NextResponse.json(res)
    }

    if (source === 'murc') {
      const currencies = await getMurcCurrencies()
      const today = new Date().toISOString().slice(0, 10)
      const minDate = '2014-01-01'
      const years: string[] = []
      for (let y = 2014; y <= new Date().getFullYear(); y++) years.push(String(y))

      const res: CurrenciesResponse = { currencies, minDate, maxDate: today, years }
      return NextResponse.json(res)
    }

    return NextResponse.json({ error: 'Unknown source' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
