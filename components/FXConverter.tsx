'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConvertRequest, ConvertResponse, CurrenciesResponse, DateMode, RateBasis, RoundingMode, Source } from '@/lib/types'
import CurrencySelect from './CurrencySelect'
import { flagUrl } from '@/lib/flags'

// ─── History ──────────────────────────────────────────────────
interface HistoryEntry {
  id: string
  from: string
  to: string
  source: Source
  basis: RateBasis
  amount: string
  resultNum: string
  resultCcy: string
  rateDate: string
  ts: number
}

const HISTORY_KEY = 'fx-history'
const HISTORY_MAX = 8

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

const srcLabel = (s: Source) => s === 'mizuho' ? 'Mizuho' : s === 'ecb' ? 'ECB' : 'MURC'

// ─── i18n ─────────────────────────────────────────────────────
const I18N = {
  en: {
    app_title: 'FX Converter',
    app_subtitle: 'Accounting-grade rates · Mizuho / ECB / MURC',
    label_source: 'Data Source',
    label_rate_basis: 'Rate basis',
    btn_refresh: 'Refresh',
    btn_refreshing: 'Refreshing…',
    btn_loading: 'Loading…',
    label_from: 'From',
    label_to: 'To',
    btn_swap: 'Swap currencies',
    label_date_mode: 'Date',
    opt_day: 'Day',
    opt_month: 'Month',
    btn_latest: 'Use latest',
    range_available: '{min} — {max}',
    label_amount: 'Amount',
    label_result: 'Result',
    hint_result: 'Enter an amount to convert.',
    label_resolved_date: 'Resolved date',
    label_result_rounding: 'Rounding',
    label_result_decimals: 'Decimals',
    rounding_half_up: 'Half up',
    rounding_up: 'Ceiling',
    rounding_down: 'Floor',
    label_auto_summary: 'Audit summary',
    label_rate_details: 'Rate details',
    label_history: 'Recent',
    btn_copy: 'Copy',
    btn_copied: '✓ Copied',
    btn_clear: 'Clear',
    loaded_yes: 'Rates loaded',
    loaded_no: 'Not loaded',
    not_loaded: 'Not loaded',
    source_mizuho: 'Mizuho Bank',
    source_ecb: 'ECB (Frankfurter)',
    source_murc: 'Mitsubishi (MURC)',
    basis_ttm: 'TTM — mid rate',
    basis_tts: 'TTS — selling',
    basis_ttb: 'TTB — buying',
  },
  ja: {
    app_title: '為替換算',
    app_subtitle: '会計向けレート · みずほ / ECB / 三菱MURC',
    label_source: 'データソース',
    label_rate_basis: 'レート区分',
    btn_refresh: '更新',
    btn_refreshing: '更新中…',
    btn_loading: '読込中…',
    label_from: '換算元',
    label_to: '換算先',
    btn_swap: '通貨を入替',
    label_date_mode: '日付',
    opt_day: '日付指定',
    opt_month: '月次',
    btn_latest: '最新を使う',
    range_available: '{min} — {max}',
    label_amount: '金額',
    label_result: '換算結果',
    hint_result: '金額を入力してください。',
    label_resolved_date: '適用日',
    label_result_rounding: '丸め',
    label_result_decimals: '小数桁数',
    rounding_half_up: '四捨五入',
    rounding_up: '切り上げ',
    rounding_down: '切り捨て',
    label_auto_summary: '監査サマリー',
    label_rate_details: 'レート詳細',
    label_history: '履歴',
    btn_copy: 'コピー',
    btn_copied: '✓ コピー済',
    btn_clear: '削除',
    loaded_yes: 'レート読込済み',
    loaded_no: '未読込',
    not_loaded: '未読込',
    source_mizuho: 'みずほ銀行',
    source_ecb: 'ECB（Frankfurter）',
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
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v)
    return out
  }
}

// ─── Icons ────────────────────────────────────────────────────
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

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l4 4-4 4" /><path d="M20 7H4" />
      <path d="M8 21l-4-4 4-4" /><path d="M4 17h16" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg className="chevron-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────
export default function FXConverter() {
  const [theme, setTheme]   = useState<'light' | 'dark'>('light')
  const [lang, setLang]     = useState<Lang>('en')
  const [source, setSource] = useState<Source>('mizuho')
  const [basis, setBasis]   = useState<RateBasis>('ttm')
  const [from, setFrom]     = useState('JPY')
  const [to, setTo]         = useState('USD')
  const [dateMode, setDateMode] = useState<DateMode>('day')
  const [day, setDay]       = useState('')
  const [year, setYear]     = useState('')
  const [month, setMonth]   = useState('01')
  const [amount, setAmount] = useState('')
  const [rounding, setRounding] = useState<RoundingMode>('half_up')
  const [decimals, setDecimals] = useState('2')
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const [currencies, setCurrencies] = useState<string[]>(['JPY', 'USD'])
  const [years, setYears]   = useState<string[]>([])
  const [minDate, setMinDate] = useState('')
  const [maxDate, setMaxDate] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadedLabel, setLoadedLabel] = useState('')

  const [result, setResult]   = useState<ConvertResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg]   = useState('')
  const [statusType, setStatusType] = useState<'info' | 'error'>('info')
  const [detailsOpen, setDetailsOpen] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingAmount = useRef(false)
  const t = useT(lang)

  // init theme / lang / history from localStorage
  useEffect(() => {
    setTheme((localStorage.getItem('fx-theme') ?? 'light') as 'light' | 'dark')
    setLang((localStorage.getItem('fx-lang') ?? 'en') as Lang)
    setHistory(loadHistory())
  }, [])

  useEffect(() => {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-brand',
      source === 'mizuho' ? 'mizuho' : source === 'murc' ? 'murc' : 'ecb'
    )
  }, [source])

  // load currencies
  const loadCurrencies = useCallback(async (src: Source, refresh = false) => {
    setLoading(true)
    setStatusMsg('')
    try {
      const url = `/api/currencies?source=${src}${refresh ? '&refresh=true' : ''}`
      const res  = await fetch(url)
      const data: CurrenciesResponse & { error?: string } = await res.json()
      if (data.error) { setStatusMsg(data.error); setStatusType('error'); setLoaded(false); return }
      setCurrencies(data.currencies)
      setYears(data.years)
      setMinDate(data.minDate)
      setMaxDate(data.maxDate)
      setLoaded(true)
      setLoadedLabel(src === 'mizuho' ? t('source_mizuho') : src === 'ecb' ? t('source_ecb') : t('source_murc'))
      setFrom(prev => data.currencies.includes(prev) ? prev : 'JPY')
      setTo(prev => data.currencies.includes(prev) ? prev : data.currencies.includes('USD') ? 'USD' : data.currencies[1] ?? 'USD')
      if (!day && data.maxDate) setDay(data.maxDate)
      if (data.years.length > 0) setYear(prev => prev && data.years.includes(prev) ? prev : data.years[data.years.length - 1])
    } catch (err) {
      setStatusMsg(String(err)); setStatusType('error')
    } finally {
      setLoading(false)
    }
  }, [day, t])

  useEffect(() => { loadCurrencies('mizuho') }, []) // eslint-disable-line

  // conversion
  const doConvert = useCallback(async () => {
    if (!loaded || !amount.trim()) return
    setLoading(true)
    setStatusMsg('')
    try {
      const body: ConvertRequest = { source, from, to, dateMode, day, year, month, basis, amount, rounding, decimals }
      const res  = await fetch('/api/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data: ConvertResponse = await res.json()
      setResult(data)
      if (data.error) {
        setStatusMsg(data.error); setStatusType('error')
      } else if (!typingAmount.current && data.result && data.result !== '-') {
        // Save to history only when amount is finalized (blur / Enter), not while typing
        const parts = data.result.split(/\s{2,}/)
        const entry: HistoryEntry = {
          id: String(Date.now()),
          from, to, source, basis, amount,
          resultNum: parts[0] ?? '',
          resultCcy: parts[1] ?? '',
          rateDate: data.selDate && data.selDate !== '—' ? data.selDate : day,
          ts: Date.now(),
        }
        setHistory(prev => {
          const deduped = prev.filter(h =>
            !(h.from === entry.from && h.to === entry.to &&
              h.source === entry.source && h.rateDate === entry.rateDate &&
              h.amount === entry.amount)
          )
          const next = [entry, ...deduped].slice(0, HISTORY_MAX)
          try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
          return next
        })
      }
    } catch (err) {
      setStatusMsg(String(err)); setStatusType('error')
    } finally {
      setLoading(false)
    }
  }, [loaded, amount, source, from, to, dateMode, day, year, month, basis, rounding, decimals])

  const scheduleConvert = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => doConvert(), 300)
  }, [doConvert])

  useEffect(() => {
    if (loaded && amount.trim()) scheduleConvert()
  }, [from, to, dateMode, day, year, month, basis, rounding, decimals, loaded]) // eslint-disable-line

  // handlers
  function handleSourceChange(s: Source) { setSource(s); setResult(null); loadCurrencies(s) }
  function handleSwap()      { setFrom(to); setTo(from) }
  function handleUseLatest() {
    if (dateMode === 'day') { setDay(maxDate) }
    else if (maxDate) { setYear(maxDate.slice(0, 4)); setMonth(maxDate.slice(5, 7)) }
  }
  function handleAmountBlur() {
    const n = parseFloat(amount.replace(/,/g, ''))
    if (!isNaN(n)) setAmount(n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    typingAmount.current = false
    doConvert()
  }
  function handleCopy() {
    if (!result?.auditSummary || result.auditSummary === '—') return
    navigator.clipboard.writeText(result.auditSummary).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  function handleRestoreHistory(entry: HistoryEntry) {
    setAmount(entry.amount)
    setDateMode('day')
    setDay(entry.rateDate)
    setBasis(entry.basis)
    setFrom(entry.from)
    setTo(entry.to)
    if (entry.source !== source) {
      setSource(entry.source)
      loadCurrencies(entry.source)
    }
  }
  function clearHistory() {
    setHistory([])
    try { localStorage.removeItem(HISTORY_KEY) } catch {}
  }
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next); localStorage.setItem('fx-theme', next)
  }
  function toggleLang() {
    const next: Lang = lang === 'ja' ? 'en' : 'ja'
    setLang(next); localStorage.setItem('fx-lang', next)
  }

  const basisLabel = source === 'murc' ? basis.toUpperCase() : source === 'mizuho' ? 'TTM' : 'MID'

  const [resultNum, resultCcy] = (() => {
    if (!result?.result || result.result === '-') return ['—', '']
    const parts = result.result.split(/\s{2,}/)
    return [parts[0] ?? '—', parts[1] ?? '']
  })()

  const resultNumFontSize =
    resultNum.length > 18 ? '22px' :
    resultNum.length > 14 ? '28px' :
    resultNum.length > 10 ? '36px' : '46px'

  const toFlagUrl = flagUrl(to)

  return (
    <>
      {loading && (
        <div className="page-bar">
          <div className="page-bar-fill" />
        </div>
      )}

      <div className="app">
        {/* ── Topbar ── */}
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">FX</div>
            <div>
              <div className="brand-name">{t('app_title')}</div>
              <div className="brand-sub">{t('app_subtitle')}</div>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="lang-toggle" onClick={toggleLang}
              title={lang === 'ja' ? 'Switch to English' : '日本語に切替'}
              aria-label={lang === 'ja' ? 'Switch to English' : '日本語に切替'}>
              <span className={lang === 'en' ? 'lang-opt lang-opt-active' : 'lang-opt'}>EN</span>
              <span className="lang-divider">|</span>
              <span className={lang === 'ja' ? 'lang-opt lang-opt-active' : 'lang-opt'}>日A</span>
            </button>
            <button className="icon-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className={`status-badge ${loading ? 'loading' : loaded ? 'ok' : 'off'}`}>
              {loading ? <span className="status-spinner" /> : <span className="status-dot" />}
              {loading ? t('btn_loading') : loaded ? t('loaded_yes') : t('loaded_no')}
            </div>
          </div>
        </header>

        {/* ── Alert ── */}
        {statusMsg && (
          <div className={`alert ${statusType === 'error' ? 'alert-error' : 'alert-info'}`}>
            {statusMsg}
          </div>
        )}

        {/* ── Main workspace ── */}
        <div className="workspace">

          {/* ── Controls card ── */}
          <div className="card">

            {/* Source */}
            <div className="ctrl-section">
              <div className="section-label">{t('label_source')}</div>
              <div className="source-row">
                <select
                  value={source}
                  onChange={e => handleSourceChange(e.target.value as Source)}
                  disabled={loading}
                  style={{ flex: '1 1 150px' }}
                >
                  <option value="mizuho">{t('source_mizuho')}</option>
                  <option value="ecb">{t('source_ecb')}</option>
                  <option value="murc">{t('source_murc')}</option>
                </select>
                <button className="btn" onClick={() => loadCurrencies(source, true)} disabled={loading}>
                  {loading ? <><span className="spinner" />{t('btn_refreshing')}</> : t('btn_refresh')}
                </button>
              </div>

              {source === 'murc' && (
                <div className="source-basis-row">
                  <span className="basis-label">{t('label_rate_basis')}</span>
                  <select
                    value={basis}
                    onChange={e => setBasis(e.target.value as RateBasis)}
                    disabled={loading}
                    style={{ flex: 1 }}
                  >
                    <option value="ttm">{t('basis_ttm')}</option>
                    <option value="tts">{t('basis_tts')}</option>
                    <option value="ttb">{t('basis_ttb')}</option>
                  </select>
                </div>
              )}

              <div className="source-meta">
                {loaded ? (
                  <>
                    <span className="source-chip">{loadedLabel}</span>
                    {minDate && maxDate && <span className="range-text">{t('range_available', { min: minDate, max: maxDate })}</span>}
                  </>
                ) : (
                  <span className="range-text">{t('not_loaded')}</span>
                )}
              </div>
            </div>

            {/* Currency pair */}
            <div className="ctrl-section">
              <div className="section-label">{t('label_from')} / {t('label_to')}</div>
              <div className="pair-row">
                <div className="pair-field">
                  <div className="pair-label">{t('label_from')}</div>
                  <CurrencySelect value={from} onChange={setFrom} options={currencies} disabled={loading} />
                </div>
                <button className="swap-btn" onClick={handleSwap} disabled={loading} title={t('btn_swap')}>
                  <SwapIcon />
                </button>
                <div className="pair-field">
                  <div className="pair-label">{t('label_to')}</div>
                  <CurrencySelect value={to} onChange={setTo} options={currencies} disabled={loading} />
                </div>
              </div>
            </div>

            {/* Date */}
            <div className="ctrl-section">
              <div className="section-header">
                <div className="section-label">{t('label_date_mode')}</div>
                <button className="btn-ghost" onClick={handleUseLatest} disabled={loading || !loaded}>
                  {t('btn_latest')}
                </button>
              </div>
              <div className="date-row">
                <select
                  value={dateMode}
                  onChange={e => setDateMode(e.target.value as DateMode)}
                  disabled={loading}
                  style={{ flex: '0 0 auto', minWidth: 100 }}
                >
                  <option value="day">{t('opt_day')}</option>
                  <option value="month">{t('opt_month')}</option>
                </select>

                {dateMode === 'day' ? (
                  <input
                    type="date"
                    value={day}
                    min={minDate}
                    max={maxDate}
                    onChange={e => setDay(e.target.value)}
                    disabled={loading}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <>
                    <select value={year} onChange={e => setYear(e.target.value)} disabled={loading} style={{ flex: 1 }}>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={month} onChange={e => setMonth(e.target.value)} disabled={loading} style={{ flex: '0 0 auto', minWidth: 72 }}>
                      {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m =>
                        <option key={m} value={m}>{m}</option>
                      )}
                    </select>
                  </>
                )}
              </div>
            </div>

            {/* Amount + inline rounding options */}
            <div className="ctrl-section">
              <div className="section-label">{t('label_amount')}</div>
              <div className="input-affix-wrap">
                <span className="input-prefix">{from}</span>
                <input
                  type="text"
                  value={amount}
                  placeholder="10,000"
                  onChange={e => { setAmount(e.target.value); typingAmount.current = true; scheduleConvert() }}
                  onBlur={handleAmountBlur}
                  onKeyDown={e => { if (e.key === 'Enter') { typingAmount.current = false; e.currentTarget.blur(); doConvert() } }}
                />
              </div>
              <div className="amount-opts">
                <span className="opts-label">{t('label_result_rounding')}</span>
                <select value={rounding} onChange={e => setRounding(e.target.value as RoundingMode)} disabled={loading}>
                  <option value="half_up">{t('rounding_half_up')}</option>
                  <option value="up">{t('rounding_up')}</option>
                  <option value="down">{t('rounding_down')}</option>
                </select>
                <span className="opts-sep">·</span>
                <span className="opts-label">{t('label_result_decimals')}</span>
                <select value={decimals} onChange={e => setDecimals(e.target.value)} disabled={loading}>
                  {Array.from({ length: 9 }, (_, i) => String(i)).map(d =>
                    <option key={d} value={d}>{d}</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* ── Right column: result + history ── */}
          <div className="right-col">

            {/* Result card */}
            <div className="card result-card selectable">
              <div className="result-header">
                <div className="section-label" style={{ margin: 0 }}>{t('label_result')}</div>
                <div className="result-badges">
                  <span className="badge badge-accent">{basisLabel}</span>
                  {result?.usedDate && result.usedDate !== '-' && (
                    <span className="badge badge-neutral">{result.usedDate}</span>
                  )}
                </div>
              </div>

              <div className="result-display">
                {resultNum !== '—' ? (
                  <>
                    <div className="result-num" style={{ fontSize: resultNumFontSize }}>{resultNum}</div>
                    {resultCcy && (
                      <div className="result-ccy">
                        {toFlagUrl && <img src={toFlagUrl} alt="" className="result-flag" width={24} height={17} />}
                        {resultCcy}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="result-empty">
                    <svg className="result-empty-icon" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 3l4 4-4 4" /><path d="M20 7H4" />
                      <path d="M8 21l-4-4 4-4" /><path d="M4 17h16" />
                    </svg>
                    <div className="result-empty-pair">
                      {flagUrl(from) && <img src={flagUrl(from)!} alt="" className="result-empty-flag" width={22} height={15} />}
                      <span>{from}</span>
                      <span className="result-empty-arrow">→</span>
                      {flagUrl(to) && <img src={flagUrl(to)!} alt="" className="result-empty-flag" width={22} height={15} />}
                      <span>{to}</span>
                    </div>
                    <p className="result-empty-hint">{t('hint_result')}</p>
                  </div>
                )}
              </div>

              {result && resultNum !== '—' && (
                <>
                  <div className="rate-table">
                    <div className="rate-row">
                      <span className="rate-key">{t('label_resolved_date')}</span>
                      <span className="rate-val">{result.selDate ?? '—'}</span>
                    </div>
                    {from !== 'JPY' && (
                      <div className="rate-row">
                        <span className="rate-key">{from} → JPY</span>
                        <span className="rate-val">{result.rateFrom ?? '—'}</span>
                      </div>
                    )}
                    {to !== 'JPY' && (
                      <div className="rate-row">
                        <span className="rate-key">{to} → JPY</span>
                        <span className="rate-val">{result.rateTo ?? '—'}</span>
                      </div>
                    )}
                    <div className="rate-row">
                      <span className="rate-key">{from}/{to}</span>
                      <span className="rate-val">{result.rateCross ?? '—'}</span>
                    </div>
                  </div>

                  <div className="summary-section">
                    <div className="section-header" style={{ marginBottom: 0 }}>
                      <div className="section-label" style={{ margin: 0 }}>{t('label_auto_summary')}</div>
                      <button
                        className={`copy-btn${copied ? ' copied' : ''}`}
                        onClick={handleCopy}
                        disabled={!result.auditSummary || result.auditSummary === '—'}
                      >
                        {copied ? t('btn_copied') : t('btn_copy')}
                      </button>
                    </div>
                    <pre className="summary-pre">{result.auditSummary ?? '—'}</pre>
                  </div>

                  {result.fallback && (
                    <div className="fallback-note">{result.fallback}</div>
                  )}
                </>
              )}
            </div>

            {/* History card */}
            {history.length > 0 && (
              <div className="card history-card">
                <div className="history-header">
                  <span className="section-label" style={{ margin: 0 }}>{t('label_history')}</span>
                  <button className="btn-ghost" onClick={clearHistory}>{t('btn_clear')}</button>
                </div>
                <div className="history-list">
                  {history.map(entry => {
                    const ff = flagUrl(entry.from)
                    const tf = flagUrl(entry.to)
                    return (
                      <button
                        key={entry.id}
                        className="history-entry"
                        onClick={() => handleRestoreHistory(entry)}
                        title={`Restore: ${entry.from} → ${entry.to} ${entry.amount}`}
                      >
                        <div className="history-left">
                          <div className="history-pair">
                            {ff && <img src={ff} className="history-flag" width={16} height={11} alt="" />}
                            <span>{entry.from}</span>
                            <span className="history-arrow">→</span>
                            {tf && <img src={tf} className="history-flag" width={16} height={11} alt="" />}
                            <span>{entry.to}</span>
                          </div>
                          <div className="history-sub">{entry.amount} · {srcLabel(entry.source)}</div>
                        </div>
                        <div className="history-right">
                          <div>
                            <span className="history-result-num">{entry.resultNum}</span>
                            {entry.resultCcy && <span className="history-result-ccy">{entry.resultCcy}</span>}
                          </div>
                          <div className="history-date">{entry.rateDate}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Rate details ── */}
        <div className={`card details-card ${detailsOpen ? 'details-open' : ''}`}>
          <button className="details-toggle" onClick={() => setDetailsOpen(o => !o)}>
            <span>{t('label_rate_details')}</span>
            <ChevronIcon />
          </button>
          {detailsOpen && (
            <div className="details-body">
              <pre>{result?.rateInfo ?? '—'}</pre>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
