'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConvertRequest, ConvertResponse, CurrenciesResponse, DateMode, RateBasis, RoundingMode, Source } from '@/lib/types'

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const I18N = {
  en: {
    app_title: 'FX Converter',
    app_subtitle: 'Accounting-friendly FX rates (Mizuho / Mitsubishi MURC)',
    label_source: 'Data source',
    label_provider: 'Provider',
    label_rate_basis: 'Rate basis (TTM / TTS / TTB)',
    btn_refresh: 'Refresh',
    btn_refreshing: 'Refreshing…',
    label_loaded: 'Loaded:',
    label_current_basis: 'Current basis:',
    label_from: 'From',
    label_to: 'To',
    btn_swap: 'Swap',
    label_date_mode: 'Date mode',
    opt_day: 'Day',
    opt_month: 'Month',
    label_day: 'Day',
    label_year: 'Year',
    label_month: 'Month',
    btn_latest: 'Use latest',
    range_available: 'Available range: {min} to {max}',
    label_amount: 'Amount',
    hint_amount: 'Auto convert; Enter/blur to format',
    label_result: 'Result',
    hint_result: 'Choose currencies and a date to see results.',
    label_used_rate_date: 'Used rate date:',
    label_basis: 'Basis:',
    label_resolved_date: 'Resolved date',
    label_from_jpy: 'From -> JPY',
    label_to_jpy: 'To -> JPY',
    label_cross: 'Cross',
    label_result_rounding: 'Result rounding',
    label_result_decimals: 'Result decimals',
    rounding_half_up: 'Half up',
    rounding_up: 'Round up (ceiling)',
    rounding_down: 'Round down (floor)',
    label_auto_summary: 'Auto summary',
    label_rate_details: 'Rate details',
    loaded_yes: 'Rates loaded',
    loaded_no: 'No rates loaded',
    not_loaded: 'Not loaded',
    source_mizuho: 'Mizuho (quote.csv)',
    source_murc: 'Mitsubishi (MURC)',
    basis_ttm: 'TTM (mid rate)',
    basis_tts: 'TTS (Telegraphic Transfer Selling)',
    basis_ttb: 'TTB (Telegraphic Transfer Buying)',
  },
  ja: {
    app_title: '為替換算',
    app_subtitle: '会計向け為替レート（みずほ / 三菱MURC）',
    label_source: 'データソース',
    label_provider: '提供元',
    label_rate_basis: 'レート区分（TTM / TTS / TTB）',
    btn_refresh: '更新',
    btn_refreshing: '更新中…',
    label_loaded: '読込元：',
    label_current_basis: '現在の区分：',
    label_from: '換算元',
    label_to: '換算先',
    btn_swap: '入替',
    label_date_mode: '日付モード',
    opt_day: '日付',
    opt_month: '月次',
    label_day: '日付',
    label_year: '年',
    label_month: '月',
    btn_latest: '最新を使う',
    range_available: '利用可能範囲：{min} ～ {max}',
    label_amount: '金額',
    hint_amount: '自動換算。Enter/フォーカス外で整形',
    label_result: '結果',
    hint_result: '通貨と日付を選択すると結果が表示されます。',
    label_used_rate_date: '適用レート日：',
    label_basis: '区分：',
    label_resolved_date: '使用日',
    label_from_jpy: '換算元 → JPY',
    label_to_jpy: '換算先 → JPY',
    label_cross: 'クロス',
    label_result_rounding: '結果丸め',
    label_result_decimals: '小数桁数',
    rounding_half_up: '四捨五入',
    rounding_up: '切り上げ',
    rounding_down: '切り捨て',
    label_auto_summary: '自動サマリー',
    label_rate_details: 'レート詳細',
    loaded_yes: 'レート読込済み',
    loaded_no: '未読込',
    not_loaded: '未読込',
    source_mizuho: 'みずほ（quote.csv）',
    source_murc: '三菱MURC',
    basis_ttm: 'TTM（仲値）',
    basis_tts: 'TTS（電信売相場）',
    basis_ttb: 'TTB（電信買相場）',
  },
} as const

type Lang = 'en' | 'ja'
type I18nKey = keyof (typeof I18N)['en']

function useT(lang: Lang) {
  return (key: I18nKey, vars?: Record<string, string>) => {
    const dict = I18N[lang] as Record<string, string>
    let out = dict[key] ?? (I18N.en as Record<string, string>)[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{${k}}`).join(v)
      }
    }
    return out
  }
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15.5A9 9 0 1 1 8.5 3a7 7 0 0 0 12.5 12.5z" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function FXConverter() {
  // ---------- persistent prefs (localStorage) ----------
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [lang, setLang] = useState<Lang>('en')

  // ---------- form state ----------
  const [source, setSource] = useState<Source>('mizuho')
  const [basis, setBasis] = useState<RateBasis>('ttm')
  const [from, setFrom] = useState('JPY')
  const [to, setTo] = useState('USD')
  const [dateMode, setDateMode] = useState<DateMode>('day')
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('01')
  const [amount, setAmount] = useState('')
  const [rounding, setRounding] = useState<RoundingMode>('half_up')
  const [decimals, setDecimals] = useState('2')

  // ---------- API state ----------
  const [currencies, setCurrencies] = useState<string[]>(['JPY', 'USD'])
  const [years, setYears] = useState<string[]>([])
  const [minDate, setMinDate] = useState('')
  const [maxDate, setMaxDate] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadedLabel, setLoadedLabel] = useState('')

  // ---------- result state ----------
  const [result, setResult] = useState<ConvertResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [statusType, setStatusType] = useState<'info' | 'error'>('info')
  const [detailsOpen, setDetailsOpen] = useState(false)

  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t = useT(lang)

  // ---------- theme / lang init ----------
  useEffect(() => {
    const savedTheme = localStorage.getItem('fx-theme') ?? 'light'
    const savedLang = (localStorage.getItem('fx-lang') ?? 'en') as Lang
    setTheme(savedTheme as 'light' | 'dark')
    setLang(savedLang)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      theme === 'dark' ? 'dark' : ''
    )
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-brand',
      source === 'murc' ? 'murc' : 'mizuho'
    )
  }, [source])

  // ---------- load currencies ----------
  const loadCurrencies = useCallback(
    async (src: Source, refresh = false) => {
      setLoading(true)
      setStatusMsg('')
      try {
        const url = `/api/currencies?source=${src}${refresh ? '&refresh=true' : ''}`
        const res = await fetch(url)
        const data: CurrenciesResponse & { error?: string } = await res.json()
        if (data.error) {
          setStatusMsg(data.error)
          setStatusType('error')
          setLoaded(false)
          return
        }
        setCurrencies(data.currencies)
        setYears(data.years)
        setMinDate(data.minDate)
        setMaxDate(data.maxDate)
        setLoaded(true)
        setLoadedLabel(src === 'mizuho' ? t('source_mizuho') : t('source_murc'))

        // Set defaults if not already set
        setFrom((prev) => (data.currencies.includes(prev) ? prev : 'JPY'))
        setTo((prev) =>
          data.currencies.includes(prev)
            ? prev
            : data.currencies.includes('USD')
            ? 'USD'
            : data.currencies[1] ?? 'USD'
        )
        if (!day && data.maxDate) setDay(data.maxDate)
        if (data.years.length > 0) {
          setYear((prev) => (prev && data.years.includes(prev) ? prev : data.years[data.years.length - 1]))
        }
      } catch (err) {
        setStatusMsg(String(err))
        setStatusType('error')
      } finally {
        setLoading(false)
      }
    },
    [day, t]
  )

  useEffect(() => {
    loadCurrencies('mizuho')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- conversion ----------
  const doConvert = useCallback(async () => {
    if (!loaded || !amount.trim()) return
    setLoading(true)
    setStatusMsg('')
    try {
      const body: ConvertRequest = {
        source,
        from,
        to,
        dateMode,
        day,
        year,
        month,
        basis,
        amount,
        rounding,
        decimals,
      }
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data: ConvertResponse = await res.json()
      setResult(data)
      if (data.error) {
        setStatusMsg(data.error)
        setStatusType('error')
      }
    } catch (err) {
      setStatusMsg(String(err))
      setStatusType('error')
    } finally {
      setLoading(false)
    }
  }, [loaded, amount, source, from, to, dateMode, day, year, month, basis, rounding, decimals])

  const scheduleConvert = useCallback(() => {
    if (renderTimer.current) clearTimeout(renderTimer.current)
    renderTimer.current = setTimeout(() => doConvert(), 300)
  }, [doConvert])

  // Auto-convert when form changes
  useEffect(() => {
    if (loaded && amount.trim()) scheduleConvert()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, dateMode, day, year, month, basis, rounding, decimals, loaded])

  // ---------- handlers ----------
  function handleSourceChange(s: Source) {
    setSource(s)
    setResult(null)
    loadCurrencies(s)
  }

  function handleBasisChange(b: RateBasis) {
    setBasis(b)
  }

  function handleSwap() {
    setFrom(to)
    setTo(from)
  }

  function handleUseLatest() {
    if (dateMode === 'day') {
      setDay(maxDate)
    } else {
      if (maxDate) {
        setYear(maxDate.slice(0, 4))
        setMonth(maxDate.slice(5, 7))
      }
    }
  }

  function handleAmountBlur() {
    const n = parseFloat(amount.replace(/,/g, ''))
    if (!isNaN(n)) {
      setAmount(n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    }
    doConvert()
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('fx-theme', next)
  }

  function toggleLang() {
    const next: Lang = lang === 'ja' ? 'en' : 'ja'
    setLang(next)
    localStorage.setItem('fx-lang', next)
  }

  const basisLabel =
    source === 'murc' ? basis.toUpperCase() : 'MIZUHO'

  return (
    <div className="shell">
      {/* ---- Header ---- */}
      <div className="header">
        <div>
          <div className="title">{t('app_title')}</div>
          <div className="sub">{t('app_subtitle')}</div>
        </div>
        <div className="header-right">
          <button className="theme-toggle icon-btn" onClick={toggleLang} title={lang === 'ja' ? 'Switch to English' : '日本語に切替'}>
            <GlobeIcon />
          </button>
          <button className="theme-toggle icon-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className={`pill ${loaded ? 'ok' : 'off'}`}>
            {loaded ? t('loaded_yes') : t('loaded_no')}
          </div>
        </div>
      </div>

      {/* ---- Status ---- */}
      {statusMsg && (
        <div className={`status ${statusType === 'error' ? 'error' : ''}`}>
          {statusMsg}
        </div>
      )}

      {/* ---- Progress ---- */}
      {loading && (
        <div className="progress-wrap">
          <div className="progress-label">
            {source === 'mizuho' ? t('btn_refreshing') : t('btn_refreshing')}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" />
          </div>
        </div>
      )}

      {/* ---- Main grid ---- */}
      <div className="grid">
        {/* Left card: Controls */}
        <div className="card">
          {/* Source + basis */}
          <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>{t('label_source')}</label>
              <div className="row" style={{ marginTop: 6, gap: 10, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="tiny">{t('label_provider')}</div>
                  <select
                    value={source}
                    onChange={(e) => handleSourceChange(e.target.value as Source)}
                    disabled={loading}
                    style={{ minWidth: 220 }}
                  >
                    <option value="mizuho">{t('source_mizuho')}</option>
                    <option value="murc">{t('source_murc')}</option>
                  </select>
                </div>

                {source === 'murc' && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="tiny">{t('label_rate_basis')}</div>
                    <select
                      value={basis}
                      onChange={(e) => handleBasisChange(e.target.value as RateBasis)}
                      disabled={loading}
                      style={{ minWidth: 240 }}
                    >
                      <option value="ttm">{t('basis_ttm')}</option>
                      <option value="tts">{t('basis_tts')}</option>
                      <option value="ttb">{t('basis_ttb')}</option>
                    </select>
                  </div>
                )}

                <button
                  className="btn"
                  onClick={() => loadCurrencies(source, true)}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      {t('btn_refreshing')}
                    </>
                  ) : (
                    t('btn_refresh')
                  )}
                </button>
              </div>

              <div className="tiny" style={{ marginTop: 8 }}>
                <span>{t('label_loaded')}</span>{' '}
                <span id="csv-path">{loaded ? loadedLabel : t('not_loaded')}</span>
              </div>
              <div className="tiny" style={{ marginTop: 4 }}>
                <span>{t('label_current_basis')}</span>{' '}
                <span style={{ fontWeight: 600 }}>{basisLabel}</span>
              </div>
            </div>
          </div>

          <hr className="sep" />

          {/* Currency pair */}
          <div className="row align-bottom">
            <div>
              <label>{t('label_from')}</label>
              <select value={from} onChange={(e) => setFrom(e.target.value)} disabled={loading}>
                {currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label>{t('label_to')}</label>
              <select value={to} onChange={(e) => setTo(e.target.value)} disabled={loading}>
                {currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button className="btn secondary" onClick={handleSwap} disabled={loading}>
              {t('btn_swap')}
            </button>
          </div>

          {/* Date */}
          <div className="row align-bottom" style={{ marginTop: 14 }}>
            <div>
              <label>{t('label_date_mode')}</label>
              <select value={dateMode} onChange={(e) => setDateMode(e.target.value as DateMode)} disabled={loading}>
                <option value="day">{t('opt_day')}</option>
                <option value="month">{t('opt_month')}</option>
              </select>
            </div>

            {dateMode === 'day' ? (
              <div>
                <label>{t('label_day')}</label>
                <input
                  type="date"
                  value={day}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => setDay(e.target.value)}
                  disabled={loading}
                />
              </div>
            ) : (
              <>
                <div>
                  <label>{t('label_year')}</label>
                  <select value={year} onChange={(e) => setYear(e.target.value)} disabled={loading}>
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>{t('label_month')}</label>
                  <select value={month} onChange={(e) => setMonth(e.target.value)} disabled={loading}>
                    {Array.from({ length: 12 }, (_, i) =>
                      String(i + 1).padStart(2, '0')
                    ).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <button className="btn secondary" onClick={handleUseLatest} disabled={loading || !loaded}>
              {t('btn_latest')}
            </button>
          </div>

          <div className="range-pill">
            <span className="range-dot" />
            <span>
              {minDate && maxDate
                ? t('range_available', { min: minDate, max: maxDate })
                : '—'}
            </span>
          </div>

          {/* Amount */}
          <div className="row" style={{ marginTop: 14 }}>
            <div>
              <label>{t('label_amount')}</label>
              <input
                type="text"
                value={amount}
                placeholder="10000"
                onChange={(e) => {
                  setAmount(e.target.value)
                  scheduleConvert()
                }}
                onBlur={handleAmountBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.currentTarget.blur(); doConvert() }
                }}
                style={{ minWidth: 180 }}
              />
            </div>
            <div className="tiny" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
              {t('hint_amount')}
            </div>
          </div>

          {/* Rounding */}
          <div className="row align-bottom" style={{ marginTop: 12 }}>
            <div>
              <label>{t('label_result_rounding')}</label>
              <select value={rounding} onChange={(e) => setRounding(e.target.value as RoundingMode)} disabled={loading}>
                <option value="half_up">{t('rounding_half_up')}</option>
                <option value="up">{t('rounding_up')}</option>
                <option value="down">{t('rounding_down')}</option>
              </select>
            </div>
            <div>
              <label>{t('label_result_decimals')}</label>
              <select value={decimals} onChange={(e) => setDecimals(e.target.value)} disabled={loading}>
                {Array.from({ length: 9 }, (_, i) => String(i)).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right card: Result */}
        <div className="card selectable">
          <div className="row result-head">
            <div>
              <label>{t('label_result')}</label>
              <div className="result">{result?.result ?? '—'}</div>
              {!result?.result || result.result === '-' ? (
                <div className="result-hint">{t('hint_result')}</div>
              ) : null}
            </div>
            <div className="tiny result-meta">
              <div className="meta-line">
                <span>{t('label_used_rate_date')}</span>
                <span>{result?.usedDate ?? '—'}</span>
              </div>
              <div className="meta-line">
                <span>{t('label_basis')}</span>
                <span style={{ fontWeight: 600 }}>{basisLabel}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="rate-line">
              <span>{t('label_resolved_date')}</span>
              <span>{result?.selDate ?? '—'}</span>
            </div>
            <div className="rate-line">
              <span>{t('label_from_jpy')}</span>
              <span>{result?.rateFrom ?? '—'}</span>
            </div>
            <div className="rate-line">
              <span>{t('label_to_jpy')}</span>
              <span>{result?.rateTo ?? '—'}</span>
            </div>
            <div className="rate-line">
              <span>{t('label_cross')}</span>
              <span>{result?.rateCross ?? '—'}</span>
            </div>
          </div>

          <div className="auto-summary-wrap">
            <div className="tiny">{t('label_auto_summary')}</div>
            <pre className="auto-summary">{result?.auditSummary ?? '—'}</pre>
          </div>

          {result?.fallback && (
            <div className="tiny" style={{ marginTop: 10, color: 'var(--muted)' }}>
              {result.fallback}
            </div>
          )}
        </div>
      </div>

      {/* Rate details (collapsible) */}
      <div className={`card details-card ${detailsOpen ? 'details-open' : ''}`}>
        <div
          className="details-summary"
          onClick={() => setDetailsOpen((o) => !o)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setDetailsOpen((o) => !o)}
        >
          <span>{t('label_rate_details')}</span>
          <span className="details-hint">{detailsOpen ? 'Hide' : 'Show'}</span>
        </div>
        {detailsOpen && (
          <div className="details-body">
            <pre>{result?.rateInfo ?? 'Refresh to start.'}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
