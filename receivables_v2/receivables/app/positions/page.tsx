'use client'

import { useEffect, useState } from 'react'
import { fmtAED, StatusBadge } from '@/components/ui'

interface Position {
  bank: string
  month: string
  total_invoiced: number
  total_perfected: number
  total_paid: number
  balance_outstanding: number
  dominant_status: string
  invoice_count: number
  last_updated: string
}

const STATUS_ORDER = ['Draft','Sent','Bank Review','Perfected','Payment Pending','Paid']

const STATUS_STYLES: Record<string, string> = {
  'Draft':           'bg-slate-100 border-slate-200 text-slate-600',
  'Sent':            'bg-blue-50 border-blue-200 text-blue-700',
  'Bank Review':     'bg-amber-50 border-amber-200 text-amber-700',
  'Perfected':       'bg-emerald-50 border-emerald-200 text-emerald-700',
  'Payment Pending': 'bg-purple-50 border-purple-200 text-purple-700',
  'Paid':            'bg-slate-50 border-slate-100 text-slate-400',
}

const STATUS_DOT: Record<string, string> = {
  'Draft':           'bg-slate-400',
  'Sent':            'bg-blue-500',
  'Bank Review':     'bg-amber-500',
  'Perfected':       'bg-emerald-500',
  'Payment Pending': 'bg-purple-500',
  'Paid':            'bg-slate-300',
}

function getRecentMonths(n = 6): string[] {
  const months: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    months.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return months
}

export default function PositionBoardPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'grid' | 'kanban'>('grid')
  const [selected, setSelected] = useState<Position | null>(null)
  const months = getRecentMonths(6)

  useEffect(() => {
    fetch('/api/positions')
      .then(r => r.json())
      .then(data => { setPositions(Array.isArray(data) ? data : []); setLoading(false) })
  }, [])

  const allBanks = [...new Set(positions.map(p => p.bank))].sort()
  const posMap: Record<string, Position> = {}
  positions.forEach(p => { posMap[`${p.bank}|${p.month}`] = p })

  const totalOS = positions
    .filter(p => p.dominant_status !== 'Paid')
    .reduce((s, p) => s + p.balance_outstanding, 0)

  if (loading) return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-8 w-48 bg-slate-100 rounded" />
      <div className="h-96 bg-slate-100 rounded-2xl" />
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Position Board</h1>
          <p className="text-sm text-slate-500 mt-0.5">Bank × Month pipeline at a glance</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">{fmtAED(totalOS)}</p>
            <p className="text-xs text-slate-500">Total Outstanding</p>
          </div>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm">
            <button onClick={() => setView('grid')} className={`px-4 py-2 ${view === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Grid</button>
            <button onClick={() => setView('kanban')} className={`px-4 py-2 ${view === 'kanban' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Kanban</button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {STATUS_ORDER.map(s => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-slate-600">
            <div className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
            {s}
          </div>
        ))}
      </div>

      {positions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center">
          <p className="text-slate-400 text-sm">No position data yet.</p>
          <p className="text-slate-400 text-xs mt-1">Run <code className="bg-slate-100 px-1 rounded">refreshPositions()</code> in Apps Script to populate.</p>
        </div>
      ) : view === 'grid' ? (
        <GridView months={months} banks={allBanks} posMap={posMap} onSelect={setSelected} />
      ) : (
        <KanbanView positions={positions} onSelect={setSelected} />
      )}

      {selected && <PositionDetail pos={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function GridView({ months, banks, posMap, onSelect }: {
  months: string[]
  banks: string[]
  posMap: Record<string, Position>
  onSelect: (p: Position) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-white z-10 min-w-28">
              Bank
            </th>
            {months.map(m => (
              <th key={m} className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-36">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {banks.map(bank => (
            <tr key={bank} className="hover:bg-slate-50/50">
              <td className="px-4 py-3 font-semibold text-slate-900 sticky left-0 bg-white text-sm">{bank}</td>
              {months.map(month => {
                const pos = posMap[`${bank}|${month}`]
                return (
                  <td key={month} className="px-2 py-2">
                    {pos ? (
                      <button
                        onClick={() => onSelect(pos)}
                        className={`w-full rounded-xl border px-2 py-2 text-left hover:shadow-sm transition-shadow ${STATUS_STYLES[pos.dominant_status] ?? 'bg-slate-50 border-slate-200'}`}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[pos.dominant_status]}`} />
                          <span className="text-xs font-medium truncate">{pos.dominant_status}</span>
                        </div>
                        <div className="text-xs font-semibold">{fmtAED(pos.balance_outstanding)}</div>
                        {pos.invoice_count > 1 && (
                          <div className="text-xs opacity-60 mt-0.5">{pos.invoice_count} invoices</div>
                        )}
                      </button>
                    ) : (
                      <div className="text-center py-2 text-slate-200 text-xs">—</div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KanbanView({ positions, onSelect }: { positions: Position[]; onSelect: (p: Position) => void }) {
  const byStatus = STATUS_ORDER.reduce<Record<string, Position[]>>((acc, s) => {
    acc[s] = positions.filter(p => p.dominant_status === s)
    return acc
  }, {})

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {STATUS_ORDER.map(status => {
        const cols = byStatus[status] ?? []
        const totalOS = cols.reduce((s, p) => s + p.balance_outstanding, 0)
        return (
          <div key={status} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className={`px-3 py-2.5 border-b border-slate-100 ${STATUS_STYLES[status]}`}>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                <span className="text-xs font-semibold">{status}</span>
              </div>
              <div className="text-xs opacity-75 mt-0.5">
                {cols.length} · {fmtAED(totalOS)}
              </div>
            </div>
            <div className="p-2 space-y-2 max-h-96 overflow-y-auto">
              {cols.length === 0 && <p className="text-xs text-slate-300 text-center py-4">Empty</p>}
              {cols
                .sort((a, b) => b.balance_outstanding - a.balance_outstanding)
                .map(pos => (
                  <button
                    key={`${pos.bank}|${pos.month}`}
                    onClick={() => onSelect(pos)}
                    className="w-full text-left rounded-xl border border-slate-100 p-2.5 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    <div className="font-semibold text-sm text-slate-900">{pos.bank}</div>
                    <div className="text-xs text-slate-500">{pos.month}</div>
                    <div className="text-xs font-medium text-slate-700 mt-1">{fmtAED(pos.balance_outstanding)}</div>
                    {pos.invoice_count > 1 && (
                      <div className="text-xs text-slate-400">{pos.invoice_count} invoices</div>
                    )}
                  </button>
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PositionDetail({ pos, onClose }: { pos: Position; onClose: () => void }) {
  const pct = pos.total_invoiced > 0 ? Math.round((pos.total_paid / pos.total_invoiced) * 100) : 0
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">{pos.bank}</h3>
            <p className="text-xs text-slate-500">{pos.month}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <StatusBadge status={pos.dominant_status} large />
          <div className="space-y-2 text-sm">
            {[
              ['Invoiced',     fmtAED(pos.total_invoiced),     false],
              ['Perfected',    fmtAED(pos.total_perfected),    false],
              ['Paid',         fmtAED(pos.total_paid),         false],
              ['Balance O/S',  fmtAED(pos.balance_outstanding), true],
              ['Invoices',     String(pos.invoice_count),       false],
            ].map(([label, value, bold]) => (
              <div key={label as string} className="flex justify-between">
                <span className="text-slate-500">{label}</span>
                <span className={bold ? 'font-bold text-slate-900' : 'text-slate-700'}>{value}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Collection progress</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <a
            href={`/invoices?bank=${pos.bank}&month=${pos.month}`}
            className="block text-center py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
          >
            View Invoices →
          </a>
        </div>
      </div>
    </div>
  )
}
