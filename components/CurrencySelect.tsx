'use client'

import { useEffect, useRef, useState } from 'react'
import { flagUrl } from '@/lib/flags'

interface Props {
  value: string
  onChange: (v: string) => void
  options: string[]
  disabled?: boolean
  placeholder?: string
}

export default function CurrencySelect({ value, onChange, options, disabled, placeholder = 'Search…' }: Props) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef    = useRef<HTMLInputElement>(null)
  const listRef      = useRef<HTMLDivElement>(null)

  const filtered = options.filter(c => c.toLowerCase().includes(query.toLowerCase()))

  // reset focus index when query changes
  useEffect(() => { setFocusIdx(0) }, [query])

  // scroll focused option into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[focusIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusIdx, open])

  // focus search input when dropdown opens
  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  // close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function openDropdown() {
    if (disabled) return
    setQuery('')
    setFocusIdx(Math.max(0, options.indexOf(value)))
    setOpen(true)
  }

  function select(code: string) {
    onChange(code)
    setOpen(false)
    setQuery('')
  }

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (filtered[focusIdx]) select(filtered[focusIdx]) }
    if (e.key === 'Escape')    { setOpen(false); setQuery('') }
  }

  const url = flagUrl(value)

  return (
    <div ref={containerRef} className="ccy-wrap">
      {/* Trigger button */}
      <button
        type="button"
        className="ccy-trigger"
        onClick={openDropdown}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') openDropdown() }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {url
          ? <img src={url} alt="" className="ccy-flag" width={20} height={14} />
          : <span className="ccy-flag-placeholder" />
        }
        <span className="ccy-code">{value || '—'}</span>
        <svg className="ccy-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="ccy-dropdown" role="listbox" aria-label="Select currency">
          <div className="ccy-search-row">
            <input
              ref={searchRef}
              type="text"
              className="ccy-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div ref={listRef} className="ccy-list">
            {filtered.map((code, i) => {
              const u = flagUrl(code)
              return (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected={code === value}
                  className={`ccy-option ${code === value ? 'ccy-selected' : ''} ${i === focusIdx ? 'ccy-focused' : ''}`}
                  onClick={() => select(code)}
                  onMouseEnter={() => setFocusIdx(i)}
                >
                  {u
                    ? <img src={u} alt="" className="ccy-flag" width={20} height={14} />
                    : <span className="ccy-flag-placeholder" />
                  }
                  <span className="ccy-code">{code}</span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="ccy-empty">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
