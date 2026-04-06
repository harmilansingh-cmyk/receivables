'use client'

import { useEffect, useState } from 'react'
import { AgePill, fmtAED, StatusBadge } from '@/components/ui'
import Link from 'next/link'

interface DashData {
  kpi: {
    totalOS: number
    totalPerfected: number
    collectedThisMonth: number
    avgAgeing: number
    wtAvgAgeing: number
  }
  actionItems: {
    needsChase: number
    blockedAtReview: number
    escalated: number
    awaitingSend: number
  }
}

interface Invoice {
  invoice_no: string
  bank: string
  month: string
  confirmed_amount: number
  balance_outstanding: number
  pipeline_status: string
  ageing_days: number
  bank_comment: string
  sent_date: string
}

export default function TodayPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard').then(r => r.json()),
      fetch('/api/invoices').then(r => r.json()),
    ]).then(([dash, invs]) => {
      setData(dash)
      setInvoices(Array.isArray(invs) ? invs : [])
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingSkeleton />
  if (!data) return null

  const chaseReady = invoices
    .filter(i => i.pipeline_status === 'Perfected' || i.pipeline_status === 'Payment Pending')
    .sort((a, b) => b.ageing_days - a.ageing_days)

  const blockedAtReview = invoices.filter(i => i.pipeline_status === 'Bank Review')
  const escalated = invoices.filter(i => i.ageing_days > 60 && i.pipeline_status !== 'Paid')
  const awaitingSend = invoices.filter(i => i.pipeline_status === 'Draft')

  // Group chase-ready by bank
  const byBank = chaseReady.reduce<Record<string, Invoice[]>>((acc, inv) => {
    acc[inv.bank] = [...(acc[inv.bank] ?? []), inv]
    return acc
  }, {})

  const today = new Date().toLocaleDateString('en-AE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Today</h1>
          <p className="text-sm text-slate-500 mt-0.5">{today}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-slate-900">{fmtAED(data.kpi.totalOS)}</p>
          <p className="text-xs text-slate-500 uppercase tracking-wide mt-0.5">Total Outstanding</p>
        </div>
      </div>

      {/* Action buckets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ActionBucket label="Chase Ready" count={data.actionItems.needsChase} amount={chaseReady.reduce((s, i) => s + i.balance_outstanding, 0)} color="emerald" icon="💰" />
        <ActionBucket label="Blocked at Bank Review" count={data.actionItems.blockedAtReview} amount={blockedAtReview.reduce((s, i) => s + i.balance_outstanding, 0)} color="amber" icon="⏳" />
        <ActionBucket label="Escalated >60 days" count={data.actionItems.escalated} amount={escalated.reduce((s, i) => s + i.balance_outstanding, 0)} color="red" icon="🔴" />
        <ActionBucket label="Awaiting Send" count={data.actionItems.awaitingSend} amount={awaitingSend.reduce((s, i) => s + i.balance_outstanding, 0)} color="blue" icon="📤" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <KpiMini label="Collected This Month" value={fmtAED(data.kpi.collectedThisMonth)} />
        <KpiMini label="Avg Ageing" value={`${data.kpi.avgAgeing} days`} />
        <KpiMini label="Wt Avg Ageing" value={`${data.kpi.wtAvgAgeing} days`} />
      </div>

      {/* Chase ready by bank */}
      {Object.keys(byBank).length > 0 && (
        <Section title="Chase Ready — by Bank" subtitle="Perfected & Payment Pending invoices only">
          <div className="space-y-3">
            {Object.entries(byBank)
              .sort(([, a], [, b]) =>
                b.reduce((s, i) => s + i.balance_outstanding, 0) -
                a.reduce((s, i) => s + i.balance_outstanding, 0)
              )
              .map(([bank, invs]) => (
                <BankChaseRow key={bank} bank={bank} invoices={invs} />
              ))}
          </div>
        </Section>
      )}

      {/* Escalated */}
      {escalated.length > 0 && (
        <Section title="Escalations" subtitle="Outstanding > 60 days — needs senior attention">
          <InvoiceTable invoices={escalated} />
        </Section>
      )}

      {/* Blocked at Bank Review */}
      {blockedAtReview.length > 0 && (
        <Section title="Blocked at Bank Review" subtitle="Awaiting bank case confirmation before chasing">
          <InvoiceTable invoices={blockedAtReview} />
        </Section>
      )}

      {/* Awaiting Send */}
      {awaitingSend.length > 0 && (
        <Section title="Awaiting Send" subtitle="Invoice raised in Zoho but not yet emailed to bank">
          <InvoiceTable invoices={awaitingSend} />
        </Section>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

function ActionBucket({
  label, count, amount, color, icon,
}: {
  label: string; count: number; amount: number; color: string; icon: string
}) {
  const colors: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50',
    amber:   'border-amber-200 bg-amber-50',
    red:     'border-red-200 bg-red-50',
    blue:    'border-blue-200 bg-blue-50',
  }
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-medium text-slate-600 uppercase tracking-wide leading-tight">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{count}</p>
      <p className="text-xs text-slate-500 mt-0.5">{fmtAED(amount)}</p>
    </div>
  )
}

function KpiMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

function Section({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function BankChaseRow({ bank, invoices }: { bank: string; invoices: Invoice[] }) {
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<{ text: string; mailto: string } | null>(null)
  const totalOS = invoices.reduce((s, i) => s + i.balance_outstanding, 0)
  const maxAge = Math.max(...invoices.map(i => i.ageing_days))

  const doDraft = async () => {
    setDrafting(true)
    try {
      const res = await fetch('/api/chase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank }),
      }).then(r => r.json())
      setDraft({ text: res.draft, mailto: res.mailto })
    } finally {
      setDrafting(false)
    }
  }

  return (
    <div className="border border-slate-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-900 text-sm w-24">{bank}</span>
          <AgePill days={maxAge} />
          <span className="text-xs text-slate-500">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-900">{fmtAED(totalOS)}</span>
          {draft ? (
            <a
              href={draft.mailto}
              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              Open in Gmail →
            </a>
          ) : (
            <button
              onClick={doDraft}
              disabled={drafting}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
            >
              {drafting ? 'Drafting...' : 'Draft Email'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {invoices.map(inv => (
          <div key={inv.invoice_no} className="flex items-center gap-3 text-xs text-slate-600">
            <Link href={`/invoices?id=${inv.invoice_no}`} className="font-mono hover:underline text-blue-600">
              {inv.invoice_no}
            </Link>
            <span>{inv.month}</span>
            <span>{fmtAED(inv.balance_outstanding)}</span>
            <AgePill days={inv.ageing_days} />
            {inv.bank_comment && (
              <span className="text-slate-400 truncate max-w-xs" title={inv.bank_comment}>
                💬 {inv.bank_comment}
              </span>
            )}
          </div>
        ))}
      </div>

      {draft && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-1.5 font-medium">Draft preview:</p>
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 rounded-lg p-3">
            {draft.text}
          </pre>
        </div>
      )}
    </div>
  )
}

function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-100">
            <th className="pb-2 font-medium">Invoice</th>
            <th className="pb-2 font-medium">Bank</th>
            <th className="pb-2 font-medium">Month</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium text-right">Balance O/S</th>
            <th className="pb-2 font-medium">Ageing</th>
            <th className="pb-2 font-medium">Comment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {invoices.map(inv => (
            <tr key={inv.invoice_no} className="hover:bg-slate-50">
              <td className="py-2 font-mono">
                <Link href={`/invoices?id=${inv.invoice_no}`} className="hover:underline text-blue-600">
                  {inv.invoice_no}
                </Link>
              </td>
              <td className="py-2 font-medium">{inv.bank}</td>
              <td className="py-2">{inv.month}</td>
              <td className="py-2"><StatusBadge status={inv.pipeline_status} /></td>
              <td className="py-2 text-right font-medium">{fmtAED(inv.balance_outstanding)}</td>
              <td className="py-2"><AgePill days={inv.ageing_days} /></td>
              <td className="py-2 text-slate-400 truncate max-w-xs" title={inv.bank_comment}>
                {inv.bank_comment}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto animate-pulse">
      <div className="h-8 w-48 bg-slate-100 rounded" />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}
      </div>
      <div className="h-64 bg-slate-100 rounded-2xl" />
      <div className="h-48 bg-slate-100 rounded-2xl" />
    </div>
  )
}
