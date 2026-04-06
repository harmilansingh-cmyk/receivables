import { NextRequest, NextResponse } from 'next/server'
import { getInvoice, updateInvoiceRow } from '@/lib/sheets'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const inv = await getInvoice(params.id)
    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()

    // Auto-recalculate balance and status on payment
    if (body.payment_amount !== undefined) {
      body.balance_outstanding = inv.confirmed_amount - Number(body.payment_amount)
      if (body.balance_outstanding <= 0) {
        body.pipeline_status = 'Paid'
      }
    }

    await updateInvoiceRow(inv._row, body)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
