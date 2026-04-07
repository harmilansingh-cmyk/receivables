'use client'

import { useEffect, useState, Suspense } from 'react'
import { fmtAED, StatusBadge } from '@/components/ui'
import { useSearchParams, useRouter } from 'next/navigation'

interface Case {
  invoice_no: string
  client_name: string
  bank_client_name: string
  bank: string
  month: string
  channel: string
  finance_channel: string
  customer_segment: string
  disbursal_amount: number
  disbursal_amount_bank: number
  bank_confirmed_yn: string
  commission_amount: number
  gross_income: number
  include_in_invoice: string
  include_in_incentives: string
  bank_ref: string
  rejection_reason: string
  td_status: string
  recon_status: string
  _row: number
}

interface BankSummary {
  bank: string
  month: string
  total: number
  confirmed: number
  unconfirmed: number
  bankOnly: number
  prypcoOnly: number
  totalAmount: number
  confirmedAmount: number
  readyToInvoice: boolean
}

function MonthCloseInner() {
  const params = useSearchParams()
  const router = useRouter()
  const [month, setMonth] = useState(params.get('month') || new Date().toISOString().slice(0, 7))
  const [summaries, setSummaries] = useState<BankSummary[]>([])
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(false)
  const [casesLoading, setCasesLoading] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [sheetId, setSheetId] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState<string | null>(null)

  const loadMonth = async (m: string) => {
    setLoading(true)
    const data = await fetch(`/api/monthclose?month=${m}`).then(r => r.json())
    setSummaries(data.summaries || [])
    setLoading(false)
  }

  useEffect(() => { loadMonth(month) }, [month])

  useEffect(() => {
    if (!selectedBank) return
    setCasesLoading(true)
    fetch(`/api/cases?bank=${selectedBank}&month=${month}`)
      .then(r => r.json())
      .then(d => { setCases(d.cases || []); setCasesLoading(false) })
  }, [selectedBank, month])

  const totalOS    = summaries.reduce((s, b) => s + b.totalAmount, 0)
  const totalCases = summaries.reduce((s, b) => s + b.total, 0)
  const confirmedCases = summaries.reduce((s, b) => s + b.confirmed, 0)
  const readyBanks = summaries.filter(b => b.readyToInvoice).length

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-100 space-y-3">
          <div>
            <h1 className="font-bold text-slate-900">Month Close</h1>
            <p className="text-xs text-slate-500 mt-0.5">Reconcile & invoice per bank</p>
          </div>
          {/* Month selector */}
          <input
            type="month"
            value={month}
            onChange={e => { setMonth(e.target.value); setSelectedBank(null) }}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
          />
          {/* Import MIS button */}
          <button
            onClick={() => setImportModal(true)}
            className="w-full py-2 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700"
          >
            + Import MIS Sheet
          </button>
          {/* Parse bank emails button */}
          <button
            onClick={async () => {
              setParsing(true)
              setParseResult(null)
              const res = await fetch('/api/parseemails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
              }).then(r => r.json())
              setParsing(false)
              if (res.manual) {
                setParseResult('⚠️ Run parseEmailsForMonth("' + month + '") in Apps Script, then refresh.')
              } else if (res.ok) {
                setParseResult('✅ ' + res.emails_processed + ' emails parsed · ' + res.cases_found + ' cases found')
                loadMonth(month)
              } else {
                setParseResult('❌ ' + (res.error || 'Error'))
              }
            }}
            disabled={parsing}
            className="w-full py-2 text-sm font-medium bg-blue-700 text-white rounded-xl hover:bg-blue-800 disabled:opacity-50"
          >
            {parsing ? 'Parsing emails...' : '📧 Parse Bank Emails'}
          </button>
          {parseResult && (
            <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 leading-relaxed">
              {parseResult}
            </div>
          )}
        </div>

        {/* Summary strip */}
        {summaries.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-100 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-slate-900">{totalCases}</p>
              <p className="text-xs text-slate-400">Cases</p>
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-600">{confirmedCases}</p>
              <p className="text-xs text-slate-400">Confirmed</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-600">{readyBanks}</p>
              <p className="text-xs text-slate-400">Ready</p>
            </div>
          </div>
        )}

        {/* Bank list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-slate-400 animate-pulse">Loading...</div>
          ) : summaries.length === 0 ? (
            <div className="p-4 space-y-2">
              <p className="text-sm text-slate-400">No cases for {month} yet.</p>
              <p className="text-xs text-slate-300">Import the MIS sheet to get started.</p>
            </div>
          ) : (
            summaries
              .sort((a, b) => b.totalAmount - a.totalAmount)
              .map(s => (
                <button
                  key={s.bank}
                  onClick={() => setSelectedBank(s.bank)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                    selectedBank === s.bank ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-900 text-sm">{s.bank}</span>
                    <ReconStatusPill summary={s} />
                  </div>
                  <div className="text-xs text-slate-500 mb-1.5">{fmtAED(s.totalAmount)}</div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                      {s.total} cases
                    </span>
                    {s.confirmed > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                        {s.confirmed} confirmed
                      </span>
                    )}
                    {s.prypcoOnly > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                        {s.prypcoOnly} unmatched
                      </span>
                    )}
                    {s.bankOnly > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                        {s.bankOnly} bank-only
                      </span>
                    )}
                  </div>
                </button>
              ))
          )}
        </div>
      </div>

      {/* Right panel — case detail */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {!selectedBank ? (
          <ConsolidatedView
            month={month}
            summaries={summaries}
            onSelectBank={setSelectedBank}
            loading={loading}
          />
        ) : casesLoading ? (
          <div className="p-6 text-slate-400 text-sm animate-pulse">Loading cases...</div>
        ) : (
          <CaseDetailPanel
            bank={selectedBank}
            month={month}
            cases={cases}
            summary={summaries.find(s => s.bank === selectedBank)}
            onRefresh={() => {
              loadMonth(month)
              // Reload cases for this bank
              setCasesLoading(true)
              fetch(`/api/cases?bank=${selectedBank}&month=${month}`)
                .then(r => r.json())
                .then(d => { setCases(d.cases || []); setCasesLoading(false) })
            }}
            onCaseUpdate={(row, field, value) => {
              fetch('/api/cases', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _row: row, [field]: value }),
              }).then(() => {
                setCases(prev => prev.map(c => c._row === row ? { ...c, [field]: value } : c))
                loadMonth(month)
              })
            }}
          />
        )}
      </div>

      {/* Import MIS Modal */}
      {importModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Import MIS Sheet</h2>
              <button onClick={() => { setImportModal(false); setImportResult(null) }}
                className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              {importResult ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 whitespace-pre-line">
                  {importResult}
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                    Open the monthly Consolidated sheet in Google Sheets.
                    Copy the ID from the URL: <code className="bg-blue-100 px-1 rounded">/spreadsheets/d/<strong>XXXXX</strong>/edit</code>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Google Sheet ID</label>
                    <input
                      value={sheetId}
                      onChange={e => setSheetId(e.target.value)}
                      placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUq..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Month</label>
                    <input
                      type="month"
                      value={month}
                      onChange={e => setMonth(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setImportModal(false)}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!sheetId) return
                        setImporting(true)
                        const res = await fetch('/api/monthclose/import', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ sheetId, month }),
                        }).then(r => r.json())
                        setImporting(false)
                        if (res.error) {
                          setImportResult('❌ Error: ' + res.error)
                        } else {
                          setImportResult(
                            `✅ Import complete!\n\n` +
                            `${res.added} cases added\n` +
                            `${res.skipped} already existed\n\n` +
                            `By bank:\n${res.bankSummary}`
                          )
                          loadMonth(month)
                        }
                      }}
                      disabled={!sheetId || importing}
                      className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700 disabled:opacity-40"
                    >
                      {importing ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MonthClosePage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 animate-pulse">Loading...</div>}>
      <MonthCloseInner />
    </Suspense>
  )
}

// ── Case Detail Panel ────────────────────────────────────────
function CaseDetailPanel({ bank, month, cases, summary, onCaseUpdate, onRefresh }: {
  bank: string
  month: string
  cases: Case[]
  summary?: BankSummary
  onCaseUpdate: (row: number, field: string, value: string) => void
  onRefresh?: () => void
}) {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'unmatched' | 'bank_only'>('all')
  const [showLinking, setShowLinking] = useState(false)

  const filtered = cases.filter(c => {
    if (filter === 'confirmed')  return c.bank_confirmed_yn === 'Y'
    if (filter === 'unmatched')  return c.recon_status === 'PRYPCO_ONLY'
    if (filter === 'bank_only')  return c.recon_status === 'BANK_ONLY'
    return true
  })

  const totalDisb  = cases.reduce((s, c) => s + (Number(c.disbursal_amount) || 0), 0)
  const confirmedDisb = cases.filter(c => c.bank_confirmed_yn === 'Y')
    .reduce((s, c) => s + (Number(c.disbursal_amount) || 0), 0)

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900 text-xl">{bank}</h2>
          <p className="text-sm text-slate-500">{month} · {cases.length} cases</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">{fmtAED(totalDisb)}</p>
          <p className="text-xs text-slate-500">{fmtAED(confirmedDisb)} confirmed</p>
        </div>
      </div>

      {/* Recon status bar */}
      {summary && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-4 gap-4 text-center text-sm">
            <div>
              <p className="text-xl font-bold text-slate-900">{summary.total}</p>
              <p className="text-xs text-slate-500">PRYPCO cases</p>
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-600">{summary.confirmed}</p>
              <p className="text-xs text-slate-500">Bank confirmed</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600">{summary.prypcoOnly}</p>
              <p className="text-xs text-slate-500">Awaiting bank</p>
            </div>
            <div>
              <p className="text-xl font-bold text-purple-600">{summary.bankOnly}</p>
              <p className="text-xs text-slate-500">Bank-only</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Reconciliation progress</span>
              <span>{summary.total > 0 ? Math.round((summary.confirmed / summary.total) * 100) : 0}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${summary.total > 0 ? (summary.confirmed / summary.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Link Names button — shown when there are unmatched cases */}
      {(summary?.prypcoOnly ?? 0) > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowLinking(true)}
            className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-xl hover:bg-amber-700"
          >
            🔗 Link {summary?.prypcoOnly} Unmatched Names
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'confirmed', 'unmatched', 'bank_only'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              filter === f ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f === 'all' ? `All (${cases.length})` :
             f === 'confirmed' ? `Confirmed (${summary?.confirmed || 0})` :
             f === 'unmatched' ? `Awaiting Bank (${summary?.prypcoOnly || 0})` :
             `Bank-Only (${summary?.bankOnly || 0})`}
          </button>
        ))}
      </div>

      {/* Cases table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Client (PRYPCO)</th>
                <th className="px-4 py-3 font-medium">Client (Bank)</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium text-right">Disbursal</th>
                <th className="px-4 py-3 font-medium text-right">Bank Amt</th>
                <th className="px-4 py-3 font-medium">Confirmed</th>
                <th className="px-4 py-3 font-medium">Recon</th>
                <th className="px-4 py-3 font-medium">TD</th>
                <th className="px-4 py-3 font-medium">Invoice?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(c => (
                <tr
                  key={c._row}
                  className={`hover:bg-slate-50 ${
                    c.recon_status === 'BANK_ONLY' ? 'bg-purple-50/30' :
                    c.bank_confirmed_yn === 'Y' ? 'bg-emerald-50/20' : ''
                  }`}
                >
                  <td className="px-4 py-2.5 font-medium text-slate-900 text-xs max-w-xs">
                    <div className="truncate" title={c.client_name}>{c.client_name}</div>
                    {c.bank_ref && <div className="text-slate-400 font-mono">{c.bank_ref}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs">
                    <div className="truncate" title={c.bank_client_name}>{c.bank_client_name || '—'}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{c.channel || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-medium">
                    {c.disbursal_amount ? fmtAED(c.disbursal_amount) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    {c.disbursal_amount_bank ? (
                      <span className={
                        Number(c.disbursal_amount_bank) !== Number(c.disbursal_amount)
                          ? 'text-amber-600 font-medium' : 'text-slate-500'
                      }>
                        {fmtAED(Number(c.disbursal_amount_bank))}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={c.bank_confirmed_yn || ''}
                      onChange={e => onCaseUpdate(c._row, 'bank_confirmed_yn', e.target.value)}
                      className={`text-xs rounded-full px-2 py-0.5 border-0 font-medium cursor-pointer ${
                        c.bank_confirmed_yn === 'Y' ? 'bg-emerald-100 text-emerald-700' :
                        c.bank_confirmed_yn === 'N' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <option value="">Pending</option>
                      <option value="Y">✓ Yes</option>
                      <option value="N">✗ No</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <ReconStatusBadge status={c.recon_status} />
                  </td>
                  <td className="px-4 py-2.5">
                    {c.td_status ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        c.td_status.toLowerCase().includes('receiv') ? 'bg-emerald-100 text-emerald-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{c.td_status}</span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      c.include_in_invoice === 'Y' ? 'bg-blue-100 text-blue-700' :
                      c.include_in_invoice === 'N' ? 'bg-slate-100 text-slate-400' :
                      'bg-slate-50 text-slate-300'
                    }`}>
                      {c.include_in_invoice || '?'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">No cases in this filter</div>
          )}
        </div>
      </div>
      {/* Name Linking Modal */}
      {showLinking && (
        <NameLinkingPanel
          bank={bank}
          month={month}
          onClose={() => setShowLinking(false)}
          onLinked={() => { onRefresh?.() }}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────
function ReconStatusPill({ summary }: { summary: BankSummary }) {
  if (summary.readyToInvoice && summary.confirmed === summary.total) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Ready</span>
  }
  if (summary.confirmed > 0) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Partial</span>
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Pending</span>
}

function ReconStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    MATCHED:      'bg-emerald-100 text-emerald-700',
    PRYPCO_ONLY:  'bg-amber-100 text-amber-700',
    BANK_ONLY:    'bg-purple-100 text-purple-700',
  }
  const labels: Record<string, string> = {
    MATCHED:      '✓ Matched',
    PRYPCO_ONLY:  'Awaiting bank',
    BANK_ONLY:    'Bank only',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${styles[status] || 'bg-slate-100 text-slate-400'}`}>
      {labels[status] || status || '—'}
    </span>
  )
}

// ── Consolidated View ────────────────────────────────────────
function ConsolidatedView({ month, summaries, onSelectBank, loading }: {
  month: string
  summaries: BankSummary[]
  onSelectBank: (bank: string) => void
  loading: boolean
}) {
  const [expanded, setExpanded] = useState(true)

  const totalCases     = summaries.reduce((s, b) => s + b.total, 0)
  const totalConfirmed = summaries.reduce((s, b) => s + b.confirmed, 0)
  const totalAmount    = summaries.reduce((s, b) => s + b.totalAmount, 0)
  const totalConfAmt   = summaries.reduce((s, b) => s + b.confirmedAmount, 0)
  const totalAwaiting  = summaries.reduce((s, b) => s + b.prypcoOnly, 0)
  const totalBankOnly  = summaries.reduce((s, b) => s + b.bankOnly, 0)
  const pct            = totalCases > 0 ? Math.round((totalConfirmed / totalCases) * 100) : 0

  if (loading) return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-32 bg-slate-100 rounded-2xl" />
      <div className="h-64 bg-slate-100 rounded-2xl" />
    </div>
  )

  if (summaries.length === 0) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-2">
        <p className="text-slate-400 text-sm">No cases for {month} yet.</p>
        <p className="text-slate-300 text-xs">Import the MIS sheet to get started.</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {new Date(month + '-01').toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Consolidated view · {summaries.length} banks</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-slate-900">{fmtAED(totalAmount)}</p>
          <p className="text-xs text-slate-500 uppercase tracking-wide mt-0.5">Total Disbursed</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total Cases',     value: String(totalCases),                color: 'slate' },
          { label: 'Confirmed',       value: String(totalConfirmed),            color: 'emerald' },
          { label: 'Awaiting Bank',   value: String(totalAwaiting),             color: 'amber' },
          { label: 'Bank-Only',       value: String(totalBankOnly),             color: 'purple' },
          { label: 'Confirmed Amt',   value: fmtAED(totalConfAmt),              color: 'blue' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <p className={`text-2xl font-bold ${
              color === 'emerald' ? 'text-emerald-600' :
              color === 'amber'   ? 'text-amber-600'   :
              color === 'purple'  ? 'text-purple-600'  :
              color === 'blue'    ? 'text-blue-600'     :
              'text-slate-900'
            }`}>{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-600 font-medium">Overall reconciliation progress</span>
          <span className="font-bold text-slate-900">{pct}% confirmed</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1.5">
          <span>{totalConfirmed} confirmed</span>
          <span>{totalAwaiting} awaiting bank</span>
          <span>{totalBankOnly} bank-only</span>
        </div>
      </div>

      {/* Bank breakdown table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 cursor-pointer hover:bg-slate-50"
          onClick={() => setExpanded(e => !e)}
        >
          <h3 className="font-semibold text-slate-900">Bank Breakdown</h3>
          <span className="text-slate-400 text-sm">{expanded ? '▲ Collapse' : '▼ Expand'}</span>
        </div>

        {expanded && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Bank</th>
                  <th className="px-5 py-3 font-medium text-right">Cases</th>
                  <th className="px-5 py-3 font-medium text-right">Total Amt</th>
                  <th className="px-5 py-3 font-medium text-right">Confirmed</th>
                  <th className="px-5 py-3 font-medium text-right">Conf. Amt</th>
                  <th className="px-5 py-3 font-medium">Progress</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries
                  .sort((a, b) => b.totalAmount - a.totalAmount)
                  .map(b => {
                    const bPct = b.total > 0 ? Math.round((b.confirmed / b.total) * 100) : 0
                    return (
                      <tr key={b.bank} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 font-bold text-slate-900">{b.bank}</td>
                        <td className="px-5 py-3 text-right text-slate-600">{b.total}</td>
                        <td className="px-5 py-3 text-right font-medium">{fmtAED(b.totalAmount)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={b.confirmed > 0 ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                            {b.confirmed}
                          </span>
                          <span className="text-slate-400"> / {b.total}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {b.confirmedAmount > 0 ? fmtAED(b.confirmedAmount) : '—'}
                        </td>
                        <td className="px-5 py-3 w-32">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${bPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 mt-0.5 block">{bPct}%</span>
                        </td>
                        <td className="px-5 py-3">
                          {b.readyToInvoice && b.confirmed === b.total ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Ready</span>
                          ) : b.confirmed > 0 ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Partial</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Pending</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => onSelectBank(b.bank)}
                            className="text-xs text-blue-600 hover:underline font-medium"
                          >
                            View →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              {/* Totals row */}
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td className="px-5 py-3 font-bold text-slate-900">Total</td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900">{totalCases}</td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900">{fmtAED(totalAmount)}</td>
                  <td className="px-5 py-3 text-right font-bold text-emerald-600">{totalConfirmed} / {totalCases}</td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900">{fmtAED(totalConfAmt)}</td>
                  <td className="px-5 py-3">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 font-medium">{pct}%</span>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Name Linking Modal ────────────────────────────────────────
// Exported so it can be used from CaseDetailPanel
export function NameLinkingPanel({ bank, month, onClose, onLinked }: {
  bank: string
  month: string
  onClose: () => void
  onLinked: () => void
}) {
  const [unmatched, setUnmatched] = useState<{
    _row: number; client_name: string; bank: string; month: string; disbursal: number; channel: string
  }[]>([])
  const [bankNames, setBankNames] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<Record<number, boolean>>({})
  const [linked, setLinked] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [bankInput, setBankInput] = useState('')
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/casematch?bank=${bank}&month=${month}`)
      .then(r => r.json())
      .then(d => { setUnmatched(d.unmatched || []); setLoading(false) })
  }, [bank, month])

  const linkCase = async (row: number, prypcoName: string) => {
    const bankName = bankNames[row]?.trim()
    if (!bankName) return
    setSaving(s => ({ ...s, [row]: true }))
    await fetch('/api/casematch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _row: row,
        bank_name: bankName,
        bank,
        prypco_name: prypcoName,
        save_mapping: true,
      }),
    })
    setSaving(s => ({ ...s, [row]: false }))
    setLinked(l => ({ ...l, [row]: true }))
    onLinked()
  }

  const stillUnmatched = unmatched.filter(c => !linked[c._row])

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Manual Name Linking — {bank} · {month}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Type the bank&apos;s version of each client name. Saved links are remembered for future months.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
        </div>

        {/* Progress */}
        <div className="px-6 py-3 border-b border-slate-50 flex items-center gap-4 flex-shrink-0">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${unmatched.length > 0 ? ((unmatched.length - stillUnmatched.length) / unmatched.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-slate-500 flex-shrink-0">
            {unmatched.length - stillUnmatched.length}/{unmatched.length} linked
          </span>
        </div>

        {/* Case list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {loading && <p className="text-sm text-slate-400 animate-pulse">Loading...</p>}
          {!loading && stillUnmatched.length === 0 && (
            <div className="text-center py-8">
              <p className="text-emerald-600 font-medium">✅ All cases linked!</p>
              <button onClick={onClose} className="mt-4 px-4 py-2 text-sm bg-slate-900 text-white rounded-xl">
                Close
              </button>
            </div>
          )}
          {stillUnmatched.map(c => (
            <div
              key={c._row}
              className={`rounded-xl border p-4 transition-colors ${
                selected === c._row ? 'border-blue-300 bg-blue-50' : 'border-slate-100 hover:border-slate-200'
              }`}
              onClick={() => setSelected(c._row)}
            >
              <div className="flex items-start gap-4">
                {/* PRYPCO name */}
                <div className="flex-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">PRYPCO Name</p>
                  <p className="text-sm font-medium text-slate-900">{c.client_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.channel} · {fmtAED(c.disbursal)}</p>
                </div>

                {/* Arrow */}
                <div className="flex items-center pt-6 text-slate-300 text-lg">→</div>

                {/* Bank name input */}
                <div className="flex-1">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Bank Name</p>
                  <input
                    value={bankNames[c._row] || ''}
                    onChange={e => setBankNames(b => ({ ...b, [c._row]: e.target.value }))}
                    placeholder="Type name as bank wrote it..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    onClick={e => e.stopPropagation()}
                  />
                </div>

                {/* Link button */}
                <div className="flex items-center pt-5">
                  <button
                    disabled={!bankNames[c._row]?.trim() || saving[c._row]}
                    onClick={e => { e.stopPropagation(); linkCase(c._row, c.client_name) }}
                    className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 whitespace-nowrap"
                  >
                    {saving[c._row] ? '...' : 'Link ✓'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer tip */}
        <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0">
          <p className="text-xs text-slate-400">
            💡 Linked names are saved permanently — next time this client appears at {bank}, it will auto-match.
          </p>
        </div>
      </div>
    </div>
  )
}
