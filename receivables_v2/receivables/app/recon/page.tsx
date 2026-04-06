'use client'

import { useEffect, useState, Suspense } from 'react'
import { fmtAED, StatusBadge } from '@/components/ui'
import { useSearchParams } from 'next/navigation'

interface CaseSummary {
  invoice_no: string
  bank: string
  month: string
  total: number
  confirmed: number
  tdPending: number
  disputed: number
}

interface Case {
  invoice_no: string
  client_name: string
  bank: string
  month: string
  bank_ref: string
  disbursal_amount: number
  bank_confirmed_yn: string
  rejection_reason: string
  td_status: string
  _row: number
}

function ReconInner() {
  const params = useSearchParams()
  const [summaries, setSummaries] = useState<CaseSummary[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(params.get('invoice_no'))
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [casesLoading, setCasesLoading] = useState(false)

  useEffect(() => {
    // Load all cases grouped by invoice
    fetch('/api/cases')
      .then(r => r.json())
      .then(data => {
        // Group into summaries
        const grouped: Record<string, CaseSummary> = {}
        ;(data.cases || []).forEach((c: Case) => {
          if (!grouped[c.invoice_no]) {
            grouped[c.invoice_no] = {
              invoice_no: c.invoice_no,
              bank: c.bank,
              month: c.month,
              total: 0, confirmed: 0, tdPending: 0, disputed: 0,
            }
          }
          grouped[c.invoice_no].total++
          if (c.bank_confirmed_yn === 'Y') grouped[c.invoice_no].confirmed++
          if (c.bank_confirmed_yn === 'N') grouped[c.invoice_no].disputed++
          if (c.td_status?.toLowerCase().includes('pending')) grouped[c.invoice_no].tdPending++
        })
        setSummaries(Object.values(grouped).sort((a, b) => b.total - a.total))
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedInvoice) return
    setCasesLoading(true)
    fetch(`/api/cases?invoice_no=${selectedInvoice}`)
      .then(r => r.json())
      .then(data => {
        setCases(data.cases || [])
        setCasesLoading(false)
      })
  }, [selectedInvoice])

  const updateCase = async (c: Case, field: string, value: string) => {
    await fetch('/api/cases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _row: c._row, [field]: value }),
    })
    setCases(prev => prev.map(x => x._row === c._row ? { ...x, [field]: value } : x))
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel — invoice list */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-slate-100">
          <h1 className="font-bold text-slate-900">Reconciliation</h1>
          <p className="text-xs text-slate-500 mt-0.5">Case-level match status per invoice</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-slate-400 animate-pulse">Loading...</div>
          ) : summaries.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">
              No case data yet. Run the email parser in Apps Script to populate.
            </div>
          ) : (
            summaries.map(s => (
              <button
                key={s.invoice_no}
                onClick={() => setSelectedInvoice(s.invoice_no)}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                  selectedInvoice === s.invoice_no ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-medium text-slate-900">{s.invoice_no}</span>
                  <ReconPill confirmed={s.confirmed} total={s.total} />
                </div>
                <div className="text-xs text-slate-500">{s.bank} · {s.month}</div>
                <div className="flex gap-2 mt-1">
                  {s.tdPending > 0 && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      {s.tdPending} TD pending
                    </span>
                  )}
                  {s.disputed > 0 && (
                    <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">
                      {s.disputed} disputed
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
        {!selectedInvoice ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Select an invoice to see case detail
          </div>
        ) : casesLoading ? (
          <div className="p-6 animate-pulse text-slate-400 text-sm">Loading cases...</div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-lg">{selectedInvoice}</h2>
                <p className="text-sm text-slate-500">
                  {cases[0]?.bank} · {cases[0]?.month} · {cases.length} cases
                </p>
              </div>
              <div className="flex gap-2">
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">
                    {cases.filter(c => c.bank_confirmed_yn === 'Y').length}/{cases.length}
                  </p>
                  <p className="text-xs text-slate-500">Confirmed by bank</p>
                </div>
              </div>
            </div>

            {/* Cases table */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Client Name</th>
                    <th className="px-4 py-3 font-medium">Bank Ref</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium">Bank Confirmed</th>
                    <th className="px-4 py-3 font-medium">TD Status</th>
                    <th className="px-4 py-3 font-medium">Rejection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cases.map(c => (
                    <tr key={c._row} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{c.client_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.bank_ref || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {c.disbursal_amount ? fmtAED(c.disbursal_amount) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={c.bank_confirmed_yn || ''}
                          onChange={e => updateCase(c, 'bank_confirmed_yn', e.target.value)}
                          className={`text-xs rounded-full px-2 py-0.5 border-0 font-medium cursor-pointer ${
                            c.bank_confirmed_yn === 'Y' ? 'bg-emerald-100 text-emerald-700' :
                            c.bank_confirmed_yn === 'N' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <option value="">Unknown</option>
                          <option value="Y">✓ Confirmed</option>
                          <option value="N">✗ Not confirmed</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <TDStatusPill status={c.td_status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {c.rejection_reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cases.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No cases found for this invoice. Run the email parser to populate.
                </div>
              )}
            </div>

            {/* Perfected button */}
            {cases.length > 0 && (
              <MarkPerfectedSection cases={cases} invoiceNo={selectedInvoice} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReconPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 animate-pulse">Loading...</div>}>
      <ReconInner />
    </Suspense>
  )
}

// ── Sub-components ───────────────────────────────────────────

function ReconPill({ confirmed, total }: { confirmed: number; total: number }) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0
  const cls = pct === 100 ? 'bg-emerald-100 text-emerald-700' :
              pct >= 50   ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {confirmed}/{total}
    </span>
  )
}

function TDStatusPill({ status }: { status: string }) {
  if (!status) return <span className="text-xs text-slate-300">—</span>
  const lower = status.toLowerCase()
  const cls = lower.includes('receiv') || lower.includes('complet') || lower.includes('done')
    ? 'bg-emerald-100 text-emerald-700'
    : lower.includes('pending') || lower.includes('wait')
    ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-600'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {status}
    </span>
  )
}

function MarkPerfectedSection({ cases, invoiceNo }: { cases: Case[]; invoiceNo: string }) {
  const confirmed = cases.filter(c => c.bank_confirmed_yn === 'Y').length
  const tdPending = cases.filter(c => c.td_status?.toLowerCase().includes('pending')).length
  const total     = cases.length
  const allClear  = confirmed === total && tdPending === 0
  const [marking, setMarking] = useState(false)
  const [done, setDone]       = useState(false)

  const markPerfected = async () => {
    setMarking(true)
    await fetch(`/api/invoices/${invoiceNo}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_status: 'Perfected' }),
    })
    setMarking(false)
    setDone(true)
  }

  if (done) return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 font-medium">
      ✅ Invoice {invoiceNo} marked as Perfected — now appears in Today&apos;s chase list
    </div>
  )

  return (
    <div className={`rounded-2xl border p-4 ${allClear ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <p className="font-medium text-slate-900">
            {allClear ? '✅ All cases clear — ready to mark Perfected' : 'Not ready to mark Perfected'}
          </p>
          <p className="text-slate-500 mt-0.5">
            {confirmed}/{total} confirmed · {tdPending} TD pending
            {!allClear && tdPending > 0 && ' · TD must be received first'}
            {!allClear && confirmed < total && ` · ${total - confirmed} cases still unconfirmed`}
          </p>
        </div>
        <button
          onClick={markPerfected}
          disabled={!allClear || marking}
          className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {marking ? 'Marking...' : 'Mark Perfected'}
        </button>
      </div>
    </div>
  )
}
