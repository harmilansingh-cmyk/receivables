'use client'

import { useEffect, useState } from 'react'

interface Bank {
  bank: string
  full_name: string
  ap_email: string
  cc_emails: string
  portal_yn: string
  payment_terms_days: number
  chase_after_days: number
  rm_name: string
  td_required_yn: string
}

export default function SettingsPage() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/banks').then(r => r.json()).then(d => { setBanks(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Banks &amp; Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Edit AP emails, chase days, and RM names directly in the <strong>BANK_MASTER</strong> tab of the Google Sheet.
          Changes reflect here on next load.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">Loading banks...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Bank</th>
                  <th className="px-4 py-3 font-medium">Full Name</th>
                  <th className="px-4 py-3 font-medium">AP Email</th>
                  <th className="px-4 py-3 font-medium">Portal</th>
                  <th className="px-4 py-3 font-medium">TD Required</th>
                  <th className="px-4 py-3 font-medium">Chase After</th>
                  <th className="px-4 py-3 font-medium">RM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {banks.map(b => (
                  <tr key={b.bank} className={`hover:bg-slate-50 ${b.portal_yn === 'Y' ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-4 py-3 font-bold text-slate-900">{b.bank}</td>
                    <td className="px-4 py-3 text-slate-600">{b.full_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {b.ap_email || <span className="text-red-400">Not set</span>}
                    </td>
                    <td className="px-4 py-3">
                      {b.portal_yn === 'Y' ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Portal</span>
                      ) : (
                        <span className="text-slate-300 text-xs">Email</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {b.td_required_yn === 'Y' ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Yes</span>
                      ) : (
                        <span className="text-slate-300 text-xs">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{b.chase_after_days}d</td>
                    <td className="px-4 py-3 text-slate-600">{b.rm_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
