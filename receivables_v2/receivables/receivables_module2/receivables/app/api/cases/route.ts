import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  return google.sheets({ version: 'v4', auth })
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

interface Case {
  invoice_no: string
  client_name: string
  bank: string
  month: string
  bank_ref: string
  disbursal_amount: number
  bank_confirmed_yn: string
  rejection_reason: string
  td_status: string
  td_source: string
  mis_source: string
  created_at: string
  updated_at: string
  _row: number
}

function rowToCase(row: unknown[], rowIndex: number): Case {
  const r = row as string[]
  return {
    invoice_no:        r[0]  || '',
    client_name:       r[1]  || '',
    bank:              r[2]  || '',
    month:             r[3]  || '',
    bank_ref:          r[4]  || '',
    disbursal_amount:  Number(r[5]) || 0,
    bank_confirmed_yn: r[6]  || '',
    rejection_reason:  r[7]  || '',
    td_status:         r[8]  || '',
    td_source:         r[9]  || '',
    mis_source:        r[10] || '',
    created_at:        r[11] || '',
    updated_at:        r[12] || '',
    _row: rowIndex,
  }
}

// GET /api/cases?invoice_no=PI-03483
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const invoiceNo = searchParams.get('invoice_no')
    const bank      = searchParams.get('bank')
    const month     = searchParams.get('month')

    const api = getSheets()
    const res = await api.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'INVOICE_CASES!A2:M',
    })

    const rows = res.data.values ?? []
    let cases = rows
      .map((row, i) => rowToCase(row, i + 2))
      .filter(c => c.client_name !== '')

    if (invoiceNo) cases = cases.filter(c => c.invoice_no === invoiceNo)
    if (bank)      cases = cases.filter(c => c.bank === bank)
    if (month)     cases = cases.filter(c => c.month === month)

    // Summary stats
    const total      = cases.length
    const confirmed  = cases.filter(c => c.bank_confirmed_yn === 'Y').length
    const tdPending  = cases.filter(c => c.td_status && c.td_status.toLowerCase().includes('pending')).length
    const disputed   = cases.filter(c => c.bank_confirmed_yn === 'N').length

    return NextResponse.json({ cases, summary: { total, confirmed, tdPending, disputed } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/cases — update bank_confirmed_yn or td_status on a case
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { _row, ...fields } = body

    if (!_row) return NextResponse.json({ error: 'Missing _row' }, { status: 400 })

    const api = getSheets()

    // Read current row
    const res = await api.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `INVOICE_CASES!A${_row}:M${_row}`,
    })
    const current = (res.data.values?.[0] ?? []) as string[]
    const updated = rowToCase(current, _row)

    // Merge fields
    const merged = { ...updated, ...fields, updated_at: new Date().toISOString() }

    const row = [
      merged.invoice_no, merged.client_name, merged.bank, merged.month,
      merged.bank_ref, merged.disbursal_amount, merged.bank_confirmed_yn,
      merged.rejection_reason, merged.td_status, merged.td_source,
      merged.mis_source, merged.created_at, merged.updated_at,
    ]

    await api.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `INVOICE_CASES!A${_row}:M${_row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
