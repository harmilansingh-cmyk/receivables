'use client'

import { useEffect, useState, Suspense } from 'react'
import { fmtAED } from '@/components/ui'
import { useSearchParams } from 'next/navigation'

interface PrypcoCase {
  _row: number; case_id: string; client_name: string; bank: string; month: string
  channel: string; finance_channel: string; disbursal_amount: number
  commission_amount: number; match_id: string; match_status: string; invoice_no: string
}
interface BankCase {
  _row: number; bank_case_id: string; client_name_bank: string; bank: string; month: string
  disbursal_amount: number; bank_ref: string; philosophy: string
  payment_status: string; match_id: string; match_status: string; email_source: string
}
interface CaseMatch {
  _row: number; match_id: string; case_id: string; bank_case_id: string
  confidence: number; match_type: string; status: string
  name_score: number; amount_diff_pct: number
}
interface Summary {
  total_prypco: number; total_bank: number; confirmed: number
  pending_review: number; unmatched_p: number; unmatched_b: number
}
type Tab = 'review' | 'confirmed' | 'unmatched_p' | 'unmatched_b'

const BANKS = ['ADIB','DIB','MASHREQ','ENBD','CBD','FAB','NBF','SCB','HSBC','RAK','UAB','AL_HILAL','AJMAN','ARAB','BOB','SIB','EIB','ADCB']

function ReconInner() {
  const params = useSearchParams()
  const [bank,  setBank]  = useState(params.get('bank')  || '')
  const [month, setMonth] = useState(params.get('month') || '2026-03')
  const [prypco,    setPrypco]    = useState<PrypcoCase[]>([])
  const [bankCases, setBankCases] = useState<BankCase[]>([])
  const [matches,   setMatches]   = useState<CaseMatch[]>([])
  const [summary,   setSummary]   = useState<Summary | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [tab,       setTab]       = useState<Tab>('review')
  const [selectedP, setSelectedP] = useState<string | null>(null)
  const [selectedB, setSelectedB] = useState<string | null>(null)
  const [linking,   setLinking]   = useState(false)

  const load = async () => {
    if (!bank || !month) return
    setLoading(true)
    const res = await fetch(`/api/recon?bank=${bank}&month=${month}`).then(r => r.json())
    setPrypco(   (res.prypco    || []).map((r: Record<string,unknown>) => ({ ...r, disbursal_amount: Number(r.disbursal_amount)||0 })))
    setBankCases((res.bankCases || []).map((r: Record<string,unknown>) => ({ ...r, disbursal_amount: Number(r.disbursal_amount)||0 })))
    setMatches(res.matches || [])
    setSummary(res.summary || null)
    setLoading(false); setSelectedP(null); setSelectedB(null)
  }

  useEffect(() => { load() }, [bank, month])

  const confirmMatch = async (matchId: string) => {
    await fetch('/api/recon', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'confirm', match_id: matchId }) })
    setMatches(prev => prev.map(m => m.match_id===matchId ? {...m, status:'CONFIRMED'} : m))
    setSummary(s => s ? {...s, confirmed:s.confirmed+1, pending_review:s.pending_review-1} : s)
  }

  const rejectMatch = async (matchId: string) => {
    await fetch('/api/recon', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'reject', match_id: matchId }) })
    const match = matches.find(m => m.match_id===matchId)
    if (match) {
      setPrypco(prev => prev.map(p => p.case_id===match.case_id ? {...p, match_id:'', match_status:'UNMATCHED'} : p))
      setBankCases(prev => prev.map(b => b.bank_case_id===match.bank_case_id ? {...b, match_id:'', match_status:'UNMATCHED'} : b))
    }
    setMatches(prev => prev.filter(m => m.match_id!==matchId))
    setSummary(s => s ? {...s, pending_review:s.pending_review-1, unmatched_p:s.unmatched_p+1, unmatched_b:s.unmatched_b+1} : s)
  }

  const manualLink = async () => {
    if (!selectedP || !selectedB) return
    setLinking(true)
    const res = await fetch('/api/recon', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'manual_match', case_id:selectedP, bank_case_id:selectedB }) })
      .then(r => r.json())
    if (res.ok) {
      setPrypco(prev    => prev.map(p => p.case_id===selectedP     ? {...p, match_id:res.match_id, match_status:'MANUAL_MATCH'} : p))
      setBankCases(prev => prev.map(b => b.bank_case_id===selectedB ? {...b, match_id:res.match_id, match_status:'MANUAL_MATCH'} : b))
      setSummary(s => s ? {...s, confirmed:s.confirmed+1, unmatched_p:s.unmatched_p-1, unmatched_b:s.unmatched_b-1} : s)
      setSelectedP(null); setSelectedB(null)
    }
    setLinking(false)
  }

  const pendingMatches   = matches.filter(m => m.status==='PENDING_REVIEW')
  const confirmedMatches = matches.filter(m => m.status==='CONFIRMED' || m.match_type==='MANUAL')
  const unmatchedP = prypco.filter(p    => !p.match_id || p.match_status==='UNMATCHED')
  const unmatchedB = bankCases.filter(b => !b.match_id || b.match_status==='UNMATCHED')
  const prypcoById = Object.fromEntries(prypco.map(p    => [p.case_id,     p]))
  const bankById   = Object.fromEntries(bankCases.map(b => [b.bank_case_id, b]))

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Left sidebar */}
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-slate-100 space-y-3">
          <div>
            <h1 className="font-bold text-slate-900">Reconciliation</h1>
            <p className="text-xs text-slate-500 mt-0.5">Match PRYPCO vs bank confirmations</p>
          </div>
          <select value={bank} onChange={e => setBank(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
            <option value="">Select bank...</option>
            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
          <button onClick={load} disabled={!bank||loading}
            className="w-full py-2 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700 disabled:opacity-40">
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>

        {summary && (
          <div className="px-4 py-4 space-y-2.5 border-b border-slate-100">
            {[
              {label:'PRYPCO cases',  val:summary.total_prypco, c:'slate'},
              {label:'Bank cases',    val:summary.total_bank,   c:'slate'},
              {label:'Confirmed',     val:summary.confirmed,    c:'emerald'},
              {label:'Pending review',val:summary.pending_review,c:'amber'},
              {label:'PRYPCO only',   val:summary.unmatched_p,  c:'red'},
              {label:'Bank only',     val:summary.unmatched_b,  c:'purple'},
            ].map(({label,val,c}) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{label}</span>
                <span className={`text-sm font-bold ${
                  c==='emerald'?'text-emerald-600':c==='amber'?'text-amber-600':
                  c==='red'?'text-red-600':c==='purple'?'text-purple-600':'text-slate-900'}`}>{val}</span>
              </div>
            ))}
            <div className="pt-1">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{width:`${summary.total_prypco>0?Math.round((summary.confirmed/summary.total_prypco)*100):0}%`}} />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {summary.total_prypco>0?Math.round((summary.confirmed/summary.total_prypco)*100):0}% matched
              </p>
            </div>
          </div>
        )}

        {selectedP && selectedB && (
          <div className="px-4 py-4">
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 space-y-2">
              <p className="text-xs font-medium text-blue-700">Ready to link</p>
              <p className="text-xs text-blue-600 truncate">📋 {prypcoById[selectedP]?.client_name}</p>
              <p className="text-xs text-blue-600 truncate">🏦 {bankById[selectedB]?.client_name_bank}</p>
              <button onClick={manualLink} disabled={linking}
                className="w-full py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {linking ? 'Linking...' : '✓ Confirm Link'}
              </button>
              <button onClick={() => {setSelectedP(null); setSelectedB(null)}}
                className="w-full py-1 text-xs text-slate-400 hover:text-slate-600">Clear</button>
            </div>
          </div>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex border-b border-slate-200 bg-white px-6 pt-4 gap-1">
          {([
            {key:'review',      label:`Pending Review (${pendingMatches.length})`},
            {key:'confirmed',   label:`Confirmed (${confirmedMatches.length})`},
            {key:'unmatched_p', label:`PRYPCO Only (${unmatchedP.length})`},
            {key:'unmatched_b', label:`Bank Only (${unmatchedB.length})`},
          ] as {key:Tab;label:string}[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab===t.key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!bank ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Select a bank and month to begin
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm animate-pulse">Loading...</div>
          ) : (
            <>
              {/* PENDING REVIEW */}
              {tab==='review' && (
                <div className="space-y-3 max-w-4xl">
                  {pendingMatches.length===0 && (
                    <div className="text-center py-16 text-slate-400 text-sm">
                      No matches pending review
                      <p className="text-xs mt-1 text-slate-300">Run Auto-Match in Apps Script → PRYPCO Recon menu</p>
                    </div>
                  )}
                  {pendingMatches.map(m => {
                    const p = prypcoById[m.case_id]
                    const b = bankById[m.bank_case_id]
                    if (!p||!b) return null
                    const conf = Number(m.confidence)
                    const amtDiff = Number(m.amount_diff_pct)
                    return (
                      <div key={m.match_id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-5 py-2.5 bg-amber-50 border-b border-amber-100">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-amber-700">Auto-matched</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              conf>=85?'bg-emerald-100 text-emerald-700':conf>=70?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'
                            }`}>{conf}% confidence</span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => confirmMatch(m.match_id)}
                              className="px-3 py-1 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">✓ Confirm</button>
                            <button onClick={() => rejectMatch(m.match_id)}
                              className="px-3 py-1 text-xs font-medium bg-red-100 text-red-600 rounded-lg hover:bg-red-200">✗ Reject</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-slate-100">
                          <div className="p-4">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1.5">PRYPCO</p>
                            <p className="font-semibold text-slate-900 text-sm">{p.client_name}</p>
                            <p className="text-sm font-bold text-slate-700 mt-1">{fmtAED(p.disbursal_amount)}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{p.channel}</p>
                          </div>
                          <div className="p-4">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1.5">Bank</p>
                            <p className="font-semibold text-slate-900 text-sm">{b.client_name_bank}</p>
                            <p className={`text-sm font-bold mt-1 ${amtDiff>2?'text-amber-600':'text-slate-700'}`}>
                              {fmtAED(b.disbursal_amount)}
                              {amtDiff>2 && <span className="text-xs font-normal ml-1">({amtDiff.toFixed(1)}% diff)</span>}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 font-mono">{b.bank_ref||'—'}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* CONFIRMED */}
              {tab==='confirmed' && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden max-w-5xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                        <th className="px-4 py-3">PRYPCO Name</th>
                        <th className="px-4 py-3">Bank Name</th>
                        <th className="px-4 py-3 text-right">PRYPCO Amt</th>
                        <th className="px-4 py-3 text-right">Bank Amt</th>
                        <th className="px-4 py-3">Bank Ref</th>
                        <th className="px-4 py-3">How</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {confirmedMatches.map(m => {
                        const p = prypcoById[m.case_id]
                        const b = bankById[m.bank_case_id]
                        if (!p||!b) return null
                        const diff = p.disbursal_amount&&b.disbursal_amount
                          ? Math.abs(p.disbursal_amount-b.disbursal_amount)/Math.max(p.disbursal_amount,b.disbursal_amount)*100 : 0
                        return (
                          <tr key={m.match_id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 text-xs font-medium text-slate-900 max-w-xs truncate">{p.client_name}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 max-w-xs truncate">{b.client_name_bank}</td>
                            <td className="px-4 py-2.5 text-xs text-right">{fmtAED(p.disbursal_amount)}</td>
                            <td className={`px-4 py-2.5 text-xs text-right ${diff>2?'text-amber-600 font-medium':'text-slate-600'}`}>
                              {fmtAED(b.disbursal_amount)}</td>
                            <td className="px-4 py-2.5 text-xs font-mono text-slate-400">{b.bank_ref||'—'}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                m.match_type==='MANUAL'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>
                                {m.match_type==='MANUAL'?'Manual':'Auto'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {confirmedMatches.length===0 && (
                    <div className="py-12 text-center text-slate-400 text-sm">No confirmed matches yet</div>
                  )}
                </div>
              )}

              {/* UNMATCHED PRYPCO */}
              {tab==='unmatched_p' && (
                <div className="space-y-3 max-w-2xl">
                  <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
                    💡 Click a case to select it, then go to <strong>Bank Only</strong> tab and click the matching bank case to link them.
                  </div>
                  {unmatchedP.length===0 && <div className="text-center py-12 text-emerald-600 text-sm font-medium">✅ All PRYPCO cases matched!</div>}
                  {unmatchedP.map(p => (
                    <button key={p.case_id} onClick={() => setSelectedP(selectedP===p.case_id?null:p.case_id)}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        selectedP===p.case_id?'border-blue-400 bg-blue-50 ring-2 ring-blue-300':'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-900">{p.client_name}</span>
                        <span className="text-sm font-bold text-slate-700">{fmtAED(p.disbursal_amount)}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{p.channel} · {p.finance_channel}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* UNMATCHED BANK */}
              {tab==='unmatched_b' && (
                <div className="space-y-3 max-w-2xl">
                  {selectedP && (
                    <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
                      Selected PRYPCO: <strong>{prypcoById[selectedP]?.client_name}</strong> — click a bank case below to link
                    </div>
                  )}
                  {unmatchedB.length===0 && <div className="text-center py-12 text-emerald-600 text-sm font-medium">✅ All bank cases matched!</div>}
                  {unmatchedB.map(b => (
                    <button key={b.bank_case_id} onClick={() => setSelectedB(selectedB===b.bank_case_id?null:b.bank_case_id)}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        selectedB===b.bank_case_id?'border-blue-400 bg-blue-50 ring-2 ring-blue-300':'border-slate-200 bg-white hover:border-slate-300'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-900">{b.client_name_bank}</span>
                        <span className="text-sm font-bold text-slate-700">{fmtAED(b.disbursal_amount)}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {b.bank_ref&&<span className="font-mono">{b.bank_ref} · </span>}
                        {b.philosophy&&<span>{b.philosophy} · </span>}
                        <span>{b.payment_status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
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
