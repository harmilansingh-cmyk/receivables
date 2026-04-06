'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/today',       label: 'Today',           icon: '📋' },
  { href: '/invoices',    label: 'Invoices',         icon: '🧾' },
  { href: '/positions',   label: 'Position Board',   icon: '📊' },
  { href: '/collections', label: 'Collections',      icon: '📈' },
  { href: '/chase',       label: 'Chase Drafter',    icon: '✉️'  },
  { href: '/settings',    label: 'Banks & Settings', icon: '⚙️'  },
  { href: '/monthclose', label: 'Month Close & Recon', icon: '📅' },
]

export function Sidebar() {
  const path = usePathname()

  return (
    <aside className="w-56 min-h-screen bg-slate-900 flex flex-col flex-shrink-0">
      <div className="px-5 py-5 border-b border-slate-800">
        <p className="text-white font-bold tracking-tight">PRYPCO</p>
        <p className="text-slate-400 text-xs mt-0.5">Mortgage Receivables</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(item => {
          const active =
            path === item.href ||
            (item.href !== '/' && path.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                active
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-slate-800">
        <p className="text-xs text-slate-500">FP&amp;A · Finance</p>
      </div>
    </aside>
  )
}
