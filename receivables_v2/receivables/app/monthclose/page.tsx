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
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <p className="text-slate-400 text-sm">Select a bank to see case detail</p>
              <p className="text-slate-300 text-xs">
                Total {month}: {fmtAED(totalOS)} across {summaries.length} banks
              </p>
            </div>
          </div>
        ) : casesLoading ? (
          <div className="p-6 text-slate-400 text-sm animate-pulse">Loading cases...</div>
        ) : (
          <CaseDetailPanel
            bank={selectedBank}
            month={month}
            cases={cases}
            summary={summaries.find(s => s.bank === selectedBank)}
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
function CaseDetailPanel({ bank, month, cases, summary, onCaseUpdate }: {
  bank: string
  month: string
  cases: Case[]
  summary?: BankSummary
  onCaseUpdate: (row: number, field: string, value: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'unmatched' | 'bank_only'>('all')

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
