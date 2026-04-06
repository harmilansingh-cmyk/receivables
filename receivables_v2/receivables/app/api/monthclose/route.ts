import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth  = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  return google.sheets({ version: 'v4', auth })
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

// GET /api/monthclose?month=2026-03
// Returns bank-by-bank reconciliation summary for a month
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month')
    if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

    const api = getSheets()
    const res = await api.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'INVOICE_CASES!A2:W',
    })

    const rows    = res.data.values ?? []
    const headers = await _getCaseHeaders(api)

    function ci(f: string) { return headers.indexOf(f) }

    // Filter to this month
    const monthRows = rows.filter(r => (r[ci('month')] || '') === month)

    // Build bank summaries
    const summaryMap: Record<string, {
      bank: string; month: string
      total: number; confirmed: number; unconfirmed: number
      bankOnly: number; prypcoOnly: number
      totalAmount: number; confirmedAmount: number
    }> = {}

    monthRows.forEach(r => {
      const bank      = String(r[ci('bank')] || '')
      const confirmed = String(r[ci('bank_confirmed_yn')] || '')
      const recon     = String(r[ci('recon_status')] || '')
      const disbAmt   = Number(r[ci('disbursal_amount')] || 0)

      if (!bank) return

      if (!summaryMap[bank]) {
        summaryMap[bank] = {
          bank, month,
          total: 0, confirmed: 0, unconfirmed: 0,
          bankOnly: 0, prypcoOnly: 0,
          totalAmount: 0, confirmedAmount: 0,
        }
      }

      const b = summaryMap[bank]
      b.total++
      b.totalAmount += disbAmt
      if (confirmed === 'Y') { b.confirmed++; b.confirmedAmount += disbAmt }
      else b.unconfirmed++
      if (recon === 'BANK_ONLY')   b.bankOnly++
      if (recon === 'PRYPCO_ONLY' || recon === '') b.prypcoOnly++
    })

    const summaries = Object.values(summaryMap).map(b => ({
      ...b,
      readyToInvoice: b.prypcoOnly === 0 && b.total > 0,
    }))

    return NextResponse.json({ summaries, totalCases: monthRows.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

async function _getCaseHeaders(api: ReturnType<typeof getSheets>) {
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'INVOICE_CASES!A1:W1',
  })
  return (res.data.values?.[0] ?? []) as string[]
}
