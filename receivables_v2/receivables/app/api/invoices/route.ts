import { NextRequest, NextResponse } from 'next/server'
import { getLedger, appendInvoice } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  try {
    const { searchParams: p } = new URL(req.url)
    let invoices = await getLedger()

    if (p.get('bank'))   invoices = invoices.filter(i => i.bank === p.get('bank'))
    if (p.get('month'))  invoices = invoices.filter(i => i.month === p.get('month'))
    if (p.get('status')) invoices = invoices.filter(i => i.pipeline_status === p.get('status'))
    if (p.get('type'))   invoices = invoices.filter(i => i.invoice_type === p.get('type'))
    if (p.get('exclude_superseded') !== 'false') {
      invoices = invoices.filter(i => i.pipeline_status !== 'Superseded')
    }

    return NextResponse.json(invoices)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await appendInvoice(body)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
