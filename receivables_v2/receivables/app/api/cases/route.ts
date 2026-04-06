import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth  = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  return google.sheets({ version: 'v4', auth })
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

function rowToCase(headers: string[], row: string[], rowIndex: number) {
  const get    = (f: string) => { const i = headers.indexOf(f); return i >= 0 ? (row[i] || '') : '' }
  const getNum = (f: string) => { const i = headers.indexOf(f); if (i < 0) return 0; const clean = String(row[i] || '').replace(/,/g, '').trim(); return parseFloat(clean) || 0 }
  return {
    invoice_no:            get('invoice_no'),
    client_name:           get('client_name'),
    bank_client_name:      get('bank_client_name'),
    bank:                  get('bank'),
    month:                 get('month'),
    channel:               get('channel'),
    finance_channel:       get('finance_channel'),
    customer_segment:      get('customer_segment'),
    disbursal_amount:      getNum('disbursal_amount'),
    disbursal_amount_bank: getNum('disbursal_amount_bank'),
    bank_confirmed_yn:     get('bank_confirmed_yn'),
    commission_amount:     getNum('commission_amount'),
    gross_income:          getNum('gross_income'),
    include_in_invoice:    get('include_in_invoice'),
    include_in_incentives: get('include_in_incentives'),
    bank_ref:              get('bank_ref'),
    rejection_reason:      get('rejection_reason'),
    td_status:             get('td_status'),
    td_source:             get('td_source'),
    mis_source:            get('mis_source'),
    recon_status:          get('recon_status'),
    created_at:            get('created_at'),
    updated_at:            get('updated_at'),
    _row: rowIndex,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const invoiceNo = searchParams.get('invoice_no')
    const bank      = searchParams.get('bank')
    const month     = searchParams.get('month')

    const api = getSheets()

    const [hdrRes, dataRes] = await Promise.all([
      api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'INVOICE_CASES!1:1' }),
      api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'INVOICE_CASES!A2:Z' }),
    ])

    const headers = (hdrRes.data.values?.[0] ?? []) as string[]
    const rows    = dataRes.data.values ?? []

    let cases = rows
      .map((row, i) => rowToCase(headers, row as string[], i + 2))
      .filter(c => c.client_name !== '')

    if (invoiceNo) cases = cases.filter(c => c.invoice_no === invoiceNo)
    if (bank)      cases = cases.filter(c => c.bank === bank)
    if (month)     cases = cases.filter(c => c.month === month)

    const total      = cases.length
    const confirmed  = cases.filter(c => c.bank_confirmed_yn === 'Y').length
    const tdPending  = cases.filter(c => c.td_status?.toLowerCase().includes('pending')).length
    const disputed   = cases.filter(c => c.bank_confirmed_yn === 'N').length
    const bankOnly   = cases.filter(c => c.recon_status === 'BANK_ONLY').length
    const prypcoOnly = cases.filter(c => c.recon_status === 'PRYPCO_ONLY' || !c.recon_status).length

    return NextResponse.json({ cases, summary: { total, confirmed, tdPending, disputed, bankOnly, prypcoOnly } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { _row, ...fields } = body
    if (!_row) return NextResponse.json({ error: 'Missing _row' }, { status: 400 })

    const api = getSheets()

    const [hdrRes, rowRes] = await Promise.all([
      api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'INVOICE_CASES!1:1' }),
      api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `INVOICE_CASES!A${_row}:Z${_row}` }),
    ])

    const headers = (hdrRes.data.values?.[0] ?? []) as string[]
    const current = [...((rowRes.data.values?.[0] ?? []) as string[])]
    while (current.length < headers.length) current.push('')

    Object.entries(fields).forEach(([field, value]) => {
      const i = headers.indexOf(field)
      if (i >= 0) current[i] = String(value ?? '')
    })

    const updIdx = headers.indexOf('updated_at')
    if (updIdx >= 0) current[updIdx] = new Date().toISOString()

    await api.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `INVOICE_CASES!A${_row}:Z${_row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [current] },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
