'use client'

import { useEffect, useState } from 'react'
import { fmtAED } from '@/components/ui'

const BANKS = ['ADIB','ADCB','ENBD','FAB','DIB','CBD','HSBC','MASHREQ','RAK','NBF','SCB','UAB','AL_HILAL','AJMAN','ARAB','BOB','SIB','EIB']

export default function ChasePage() {
  const [bank, setBank] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [result, setResult] = useState<{ draft: string; mailto: string; invoiceCount: number; totalOS: number; noAction?: boolean } | null>(null)

  const doDraft = async () => {
    if (!bank) return
    setDrafting(true)
    setResult(null)
    try {
      const res = await fetch('/api/chase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank }),
      }).then(r => r.json())
      setResult(res)
    } finally {
      setDrafting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Chase Drafter</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Drafts a professional payment follow-up email for any bank. Only Perfected &amp; Payment Pending invoices are included.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex gap-3">
          <select
            value={bank}
            onChange={e => { setBank(e.target.value); setResult(null) }}
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Select a bank...</option>
            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <button
            onClick={doDraft}
            disabled={!bank || drafting}
            className="px-6 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700 disabled:opacity-40"
          >
            {drafting ? 'Drafting...' : 'Draft Email'}
          </button>
        </div>

        {result?.noAction && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-500 text-center">
            No Perfected or Payment Pending invoices found for {bank}.
          </div>
        )}

        {result && !result.noAction && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {result.invoiceCount} invoice{result.invoiceCount !== 1 ? 's' : ''} · {fmtAED(result.totalOS)} outstanding
              </span>
              <a
                href={result.mailto}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
              >
                Open in Gmail →
              </a>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium mb-2">Draft:</p>
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
                {result.draft}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
