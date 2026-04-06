import { NextRequest, NextResponse } from 'next/server'
import { splitInvoice } from '@/lib/sheets'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await splitInvoice(body)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
