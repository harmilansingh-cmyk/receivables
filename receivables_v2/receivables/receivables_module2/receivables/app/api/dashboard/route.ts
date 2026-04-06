import { NextResponse } from 'next/server'
import { getLedger, getBanks } from '@/lib/sheets'

export async function GET() {
  try {
    const [invoices] = await Promise.all([getLedger(), getBanks()])

    const active = invoices.filter(i => i.pipeline_status !== 'Superseded')
    const outstanding = active.filter(i => i.pipeline_status !== 'Paid')

    const totalOS = outstanding.reduce((s, i) => s + i.balance_outstanding, 0)

    const totalPerfected = active
      .filter(i => i.pipeline_status === 'Perfected' || i.pipeline_status === 'Payment Pending')
      .reduce((s, i) => s + i.perfected_amount, 0)

    const thisMonth = new Date().toISOString().slice(0, 7)
    const collectedThisMonth = active
      .filter(i => i.payment_date?.startsWith(thisMonth))
      .reduce((s, i) => s + i.payment_amount, 0)

    const avgAgeing = outstanding.length
      ? Math.round(outstanding.reduce((s, i) => s + i.ageing_days, 0) / outstanding.length)
      : 0

    const wtAvgAgeing = (() => {
      const sumWeighted = outstanding.reduce((s, i) => s + i.ageing_days * i.balance_outstanding, 0)
      const sumOS = outstanding.reduce((s, i) => s + i.balance_outstanding, 0)
      return sumOS ? Math.round(sumWeighted / sumOS) : 0
    })()

    const bankMap: Record<string, { os: number; perfected: number; collected: number; count: number }> = {}
    outstanding.forEach(i => {
      if (!bankMap[i.bank]) bankMap[i.bank] = { os: 0, perfected: 0, collected: 0, count: 0 }
      bankMap[i.bank].os += i.balance_outstanding
      bankMap[i.bank].perfected += i.perfected_amount
      bankMap[i.bank].count++
    })
    active.filter(i => i.payment_date?.startsWith(thisMonth)).forEach(i => {
      if (!bankMap[i.bank]) bankMap[i.bank] = { os: 0, perfected: 0, collected: 0, count: 0 }
      bankMap[i.bank].collected += i.payment_amount
    })

    const bankBreakdown = Object.entries(bankMap)
      .map(([bank, d]) => ({ bank, ...d }))
      .sort((a, b) => b.os - a.os)

    const pipelineDist: Record<string, number> = {}
    active.forEach(i => {
      pipelineDist[i.pipeline_status] = (pipelineDist[i.pipeline_status] || 0) + 1
    })

    const actionItems = {
      needsChase: outstanding.filter(
        i => i.pipeline_status === 'Perfected' || i.pipeline_status === 'Payment Pending'
      ).length,
      blockedAtReview: outstanding.filter(i => i.pipeline_status === 'Bank Review').length,
      escalated: outstanding.filter(i => i.ageing_days > 60).length,
      awaitingSend: outstanding.filter(i => i.pipeline_status === 'Draft').length,
    }

    return NextResponse.json({
      kpi: { totalOS, totalPerfected, collectedThisMonth, avgAgeing, wtAvgAgeing },
      bankBreakdown,
      pipelineDist,
      actionItems,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
