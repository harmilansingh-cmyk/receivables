// ── Formatters ───────────────────────────────────────────────
export function fmtAED(n: number): string {
  if (!n && n !== 0) return '—'
  return 'AED ' + Math.round(n).toLocaleString('en-AE')
}

export function fmtDate(s: string): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return s
  }
}

// ── AgePill ──────────────────────────────────────────────────
export function AgePill({ days }: { days: number }) {
  if (!days || days <= 0) return null
  const cls =
    days <= 30
      ? 'bg-emerald-100 text-emerald-700'
      : days <= 60
      ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {days}d
    </span>
  )
}

// ── StatusBadge ──────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600',
  Sent: 'bg-blue-100 text-blue-700',
  'Bank Review': 'bg-amber-100 text-amber-700',
  Perfected: 'bg-emerald-100 text-emerald-700',
  'Payment Pending': 'bg-purple-100 text-purple-700',
  Paid: 'bg-slate-100 text-slate-400',
  Superseded: 'bg-slate-50 text-slate-300 line-through',
}

export function StatusBadge({ status, large }: { status: string; large?: boolean }) {
  const cls = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${
        large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
      } ${cls}`}
    >
      {status}
    </span>
  )
}

// ── KpiCard ──────────────────────────────────────────────────
export function KpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}
