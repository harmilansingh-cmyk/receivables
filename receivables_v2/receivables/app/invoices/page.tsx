'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { AgePill, fmtAED, StatusBadge } from '@/components/ui'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Invoice {
  invoice_no: string
  parent_invoice_no: string
  invoice_type: string
  bank: string
  month: string
  invoice_date: string
  sent_date: string
  calculated_amount: number
  confirmed_amount: number
  balance_outstanding: number
  pipeline_status: string
  perfected_amount: number
  perfected_cases: number
  total_cases: number
  payment_date: string
  payment_amount: number
  bank_comment: string
  td_notes: string
  split_date: string
  split_reason: string
  ageing_days: number
}

const STATUSES = ['Draft','Sent','Bank Review','Perfected','Payment Pending','Paid','Superseded']
const BANKS = ['ADIB','ADCB','ENBD','FAB','DIB','CBD','HSBC','MASHREQ','RAK','NBF','SCB','UAB','AL_HILAL','AJMAN','ARAB','BOB','SIB','EIB']
const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400'

function InvoicesInner() {
  const params = useSearchParams()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({
    bank: '', month: '', status: '', search: '', excludeSuperseded: true,
  })
  const [splitTarget, setSplitTarget] = useState<Invoice | null>(null)
  const [editTarget, setEditTarget] = useState<Invoice | Partial<Invoice> | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (filter.bank)   qs.set('bank', filter.bank)
    if (filter.month)  qs.set('month', filter.month)
    if (filter.status) qs.set('status', filter.status)
    if (!filter.excludeSuperseded) qs.set('exclude_superseded', 'false')
    const data = await fetch(`/api/invoices?${qs}`).then(r => r.json())
    setInvoices(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const highlightId = params.get('id')

  const filtered = filter.search
    ? invoices.filter(i =>
        i.invoice_no.toLowerCase().includes(filter.search.toLowerCase()) ||
        i.bank.toLowerCase().includes(filter.search.toLowerCase())
      )
    : invoices

  const totalOS = filtered
    .filter(i => i.pipeline_status !== 'Paid' && i.pipeline_status !== 'Superseded')
    .reduce((s, i) => s + i.balance_outstanding, 0)

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Invoice Ledger</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{filtered.length} invoices</span>
          <span className="font-semibold text-slate-900">{fmtAED(totalOS)} O/S</span>
          <button
            onClick={() => setEditTarget({})}
            className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700"
          >
            + New Invoice
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input
            placeholder="Search invoice / bank..."
            value={filter.search}
            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            className={inputCls}
          />
          <select
            value={filter.bank}
            onChange={e => setFilter(f => ({ ...f, bank: e.target.value }))}
            className={inputCls}
          >
            <option value="">All Banks</option>
            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input
            type="month"
            value={filter.month}
            onChange={e => setFilter(f => ({ ...f, month: e.target.value }))}
            className={inputCls}
          />
          <select
            value={filter.status}
            onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            className={inputCls}
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filter.excludeSuperseded}
              onChange={e => setFilter(f => ({ ...f, excludeSuperseded: e.target.checked }))}
              className="rounded"
            />
            Hide Superseded
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">Loading invoices...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Bank</th>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Balance O/S</th>
                  <th className="px-4 py-3 font-medium">Ageing</th>
                  <th className="px-4 py-3 font-medium">Comment</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(inv => (
                  <tr
                    key={inv.invoice_no}
                    className={`hover:bg-slate-50 transition-colors ${
                      inv.invoice_no === highlightId ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''
                    } ${inv.pipeline_status === 'Superseded' ? 'opacity-40' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-mono font-medium text-slate-900">{inv.invoice_no}</span>
                        {inv.parent_invoice_no && (() => {
                          // Find grandparent — parent's parent_invoice_no
                          const parent = invoices.find(x => x.invoice_no === inv.parent_invoice_no)
                          const grandparent = parent?.parent_invoice_no
                          return (
                            <div className="text-xs text-slate-400">
                              {grandparent
                                ? <>↳ <span className="font-mono">{grandparent}</span> → <span className="font-mono">{inv.parent_invoice_no}</span></>
                                : <>↳ split from <span className="font-mono">{inv.parent_invoice_no}</span></>
                              }
                            </div>
                          )
                        })()}
                        {inv.invoice_type !== 'monthly' && (
                          <div className="text-xs text-purple-500 capitalize">
                            {inv.invoice_type.replace('_', ' ')}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{inv.bank}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.month}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.pipeline_status} /></td>
                    <td className="px-4 py-3 text-right">{fmtAED(inv.confirmed_amount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {fmtAED(inv.balance_outstanding)}
                    </td>
                    <td className="px-4 py-3">
                      {inv.ageing_days > 0 && <AgePill days={inv.ageing_days} />}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500 truncate block max-w-xs" title={inv.bank_comment}>
                        {inv.bank_comment}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditTarget(inv)}
                          className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          Edit
                        </button>
                        {inv.pipeline_status !== 'Superseded' && inv.pipeline_status !== 'Paid' && (() => {
                          // Check if this is already a grandchild (parent is itself a child)
                          const parent = inv.parent_invoice_no
                            ? invoices.find(x => x.invoice_no === inv.parent_invoice_no)
                            : null
                          const isGrandchild = !!parent?.parent_invoice_no
                          return isGrandchild ? (
                            <span className="px-2 py-1 text-xs text-slate-300 cursor-not-allowed" title="Max 2 levels of splits">
                              Max depth
                            </span>
                          ) : (
                            <button
                              onClick={() => setSplitTarget(inv)}
                              className="px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 rounded-lg"
                            >
                              Split
                            </button>
                          )
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm">
                No invoices match your filters
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit / Create modal */}
      {editTarget !== null && (
        <InvoiceModal
          invoice={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={async (formData) => {
            setSaving(true)
            try {
              if ((editTarget as Invoice).invoice_no) {
                await fetch(`/api/invoices/${(editTarget as Invoice).invoice_no}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(formData),
                })
              } else {
                await fetch('/api/invoices', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(formData),
                })
              }
            } finally {
              setSaving(false)
              setEditTarget(null)
              load()
            }
          }}
          saving={saving}
        />
      )}

      {/* Split modal */}
      {splitTarget && (
        <SplitModal
          invoice={splitTarget}
          onClose={() => setSplitTarget(null)}
          onSplit={async (data) => {
            setSaving(true)
            try {
              await fetch('/api/invoices/split', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              })
            } finally {
              setSaving(false)
              setSplitTarget(null)
              load()
            }
          }}
          saving={saving}
        />
      )}
    </div>
  )
}

// ── Default export — wraps InvoicesInner in Suspense ─────────
export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 text-sm animate-pulse">Loading...</div>}>
      <InvoicesInner />
    </Suspense>
  )
}

// ── Invoice Modal ────────────────────────────────────────────
function InvoiceModal({ invoice, onClose, onSave, saving }: {
  invoice: Partial<Invoice>
  onClose: () => void
  onSave: (data: Partial<Invoice>) => void
  saving: boolean
}) {
  const [form, setForm] = useState<Partial<Invoice>>(invoice)
  const isNew = !(invoice as Invoice).invoice_no
  const set = (k: keyof Invoice, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal title={isNew ? 'New Invoice' : `Edit ${(invoice as Invoice).invoice_no}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Invoice No (Zoho PI)" required>
          <input value={form.invoice_no ?? ''} onChange={e => set('invoice_no', e.target.value)}
            placeholder="PI-03629" disabled={!isNew} className={inputCls} />
        </Field>
        <Field label="Invoice Type">
          <select value={form.invoice_type ?? 'monthly'} onChange={e => set('invoice_type', e.target.value)} className={inputCls}>
            <option value="monthly">Monthly</option>
            <option value="top_up">Top-up</option>
            <option value="quarterly_contest">Quarterly Contest</option>
          </select>
        </Field>
        <Field label="Bank" required>
          <select value={form.bank ?? ''} onChange={e => set('bank', e.target.value)} className={inputCls}>
            <option value="">Select bank...</option>
            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Month">
          <input type="month" value={form.month ?? ''} onChange={e => set('month', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Invoice Date">
          <input type="date" value={form.invoice_date ?? ''} onChange={e => set('invoice_date', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Sent Date (ageing starts here)">
          <input type="date" value={form.sent_date ?? ''} onChange={e => set('sent_date', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Confirmed Amount (AED)" required>
          <input type="number" value={form.confirmed_amount ?? ''} onChange={e => set('confirmed_amount', Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Pipeline Status">
          <select value={form.pipeline_status ?? 'Draft'} onChange={e => set('pipeline_status', e.target.value)} className={inputCls}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Total Cases">
          <input type="number" value={form.total_cases ?? ''} onChange={e => set('total_cases', Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Perfected Cases">
          <input type="number" value={form.perfected_cases ?? ''} onChange={e => set('perfected_cases', Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Perfected Amount (AED)">
          <input type="number" value={form.perfected_amount ?? ''} onChange={e => set('perfected_amount', Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Payment Amount (AED)">
          <input type="number" value={form.payment_amount ?? ''} onChange={e => set('payment_amount', Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Payment Date">
          <input type="date" value={form.payment_date ?? ''} onChange={e => set('payment_date', e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="mt-4 space-y-3">
        <Field label="Bank Comment">
          <textarea value={form.bank_comment ?? ''} onChange={e => set('bank_comment', e.target.value)}
            rows={2} className={`${inputCls} resize-none`} placeholder="What did the bank say?" />
        </Field>
        <Field label="TD Notes">
          <textarea value={form.td_notes ?? ''} onChange={e => set('td_notes', e.target.value)}
            rows={2} className={`${inputCls} resize-none`} placeholder="Title deed status..." />
        </Field>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : isNew ? 'Create Invoice' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  )
}

// ── Split Modal ──────────────────────────────────────────────
function SplitModal({ invoice, onClose, onSplit, saving }: {
  invoice: Invoice
  onClose: () => void
  onSplit: (data: object) => void
  saving: boolean
}) {
  const [child1No, setChild1No] = useState('')
  const [child2No, setChild2No] = useState('')
  const [child1Amount, setChild1Amount] = useState<number | ''>('')
  const [child1Cases, setChild1Cases] = useState<number | ''>('')
  const [splitReason, setSplitReason] = useState('')

  const c1Amount = Number(child1Amount) || 0
  const c1Cases  = Number(child1Cases)  || 0
  const c2Amount = invoice.confirmed_amount - c1Amount
  const c2Cases  = invoice.total_cases - c1Cases
  const valid = child1No && child2No && c1Amount > 0 && c1Amount < invoice.confirmed_amount && splitReason

  return (
    <Modal title={`Split Invoice ${invoice.invoice_no}`} onClose={onClose}>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm">
        <p className="font-medium text-amber-900 mb-1">How this works</p>
        <p className="text-amber-700 text-xs">
          The original invoice becomes <strong>Superseded</strong>. Two new Zoho PI numbers replace it:
          Child 1 (bank-confirmed cases → <strong>Perfected</strong>) appears in Today&rsquo;s chase list immediately.
          Child 2 (disputed/pending cases → <strong>Bank Review</strong>) waits for further bank confirmation.
        </p>
      </div>

      <div className="mb-4 p-3 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1">
        <div>
          <span className="font-medium">Splitting: </span>
          <span className="font-mono">{invoice.invoice_no}</span>
          {' · '}{invoice.bank}{' · '}{invoice.month}{' · '}{fmtAED(invoice.confirmed_amount)}
          {invoice.total_cases ? ` · ${invoice.total_cases} cases` : ''}
        </div>
        {invoice.parent_invoice_no && (
          <div className="text-slate-400">
            ⚠️ This is already a split child of{' '}
            <span className="font-mono font-medium">{invoice.parent_invoice_no}</span>
            {' '}— grandchildren will be created (max 2 levels)
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Child 1 — Perfected</p>
          <Field label="New Zoho PI Number" required>
            <input value={child1No} onChange={e => setChild1No(e.target.value)} placeholder="PI-xxxxx" className={inputCls} />
          </Field>
          <Field label="Amount (AED)" required>
            <input type="number" value={child1Amount} onChange={e => setChild1Amount(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Cases">
            <input type="number" value={child1Cases} onChange={e => setChild1Cases(Number(e.target.value))} className={inputCls} />
          </Field>
          <p className="text-xs text-emerald-700">→ Will appear in Today&rsquo;s chase list</p>
        </div>

        <div className="space-y-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Child 2 — Disputed</p>
          <Field label="New Zoho PI Number" required>
            <input value={child2No} onChange={e => setChild2No(e.target.value)} placeholder="PI-xxxxx" className={inputCls} />
          </Field>
          <Field label="Amount (AED)">
            <input value={fmtAED(c2Amount)} disabled className={`${inputCls} bg-amber-100 text-amber-700`} />
          </Field>
          <Field label="Cases">
            <input value={c2Cases} disabled className={`${inputCls} bg-amber-100 text-amber-700`} />
          </Field>
          <p className="text-xs text-amber-700">→ Stays in Bank Review</p>
        </div>
      </div>

      <div className="mt-4">
        <Field label="Split Reason" required>
          <textarea
            value={splitReason}
            onChange={e => setSplitReason(e.target.value)}
            rows={2}
            placeholder="e.g. Bank confirmed 30 of 50 cases. 20 pending TD / dispute."
            className={`${inputCls} resize-none`}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl">
          Cancel
        </button>
        <button
          disabled={!valid || saving}
          onClick={() => onSplit({
            parentInvoiceNo: invoice.invoice_no,
            child1: { invoice_no: child1No, confirmed_amount: c1Amount, perfected_amount: c1Amount, perfected_cases: c1Cases, total_cases: c1Cases },
            child2: { invoice_no: child2No, confirmed_amount: c2Amount, perfected_amount: 0, perfected_cases: 0, total_cases: c2Cases },
            split_reason: splitReason,
          })}
          className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-xl hover:bg-amber-700 disabled:opacity-40"
        >
          {saving ? 'Splitting...' : 'Confirm Split'}
        </button>
      </div>
    </Modal>
  )
}

// ── Shared ───────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
