import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth  = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  return google.sheets({ version: 'v4', auth })
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const bank  = searchParams.get('bank')
    const month = searchParams.get('month')

    const api = getSheets()
    const [hdrRes, dataRes] = await Promise.all([
      api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'INVOICE_CASES!1:1' }),
      api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'INVOICE_CASES!A2:Z' }),
    ])

    const headers = (hdrRes.data.values?.[0] ?? []) as string[]
    const rows    = dataRes.data.values ?? []
    const ci      = (f: string) => headers.indexOf(f)

    const cases = rows
      .map((r, i) => ({ row: i + 2, data: r as string[] }))
      .filter(({ data: r }) =>
        (!bank  || r[ci('bank')]  === bank) &&
        (!month || r[ci('month')] === month) &&
        r[ci('client_name')]
      )

    const unmatched = cases.filter(({ data: r }) => !r[ci('bank_client_name')])

    return NextResponse.json({
      unmatched: unmatched.map(({ row, data: r }) => ({
        _row:        row,
        client_name: r[ci('client_name')] || '',
        bank:        r[ci('bank')]        || '',
        month:       r[ci('month')]       || '',
        disbursal:   Number(String(r[ci('disbursal_amount')] || '0').replace(/,/g, '')) || 0,
        channel:     r[ci('channel')]     || '',
      })),
      matched: cases.filter(({ data: r }) => r[ci('bank_client_name')]).length,
      total:   cases.length,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { _row, bank_name, bank, prypco_name, save_mapping } = await req.json()
    const api = getSheets()

    const [hdrRes, rowRes] = await Promise.all([
      api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'INVOICE_CASES!1:1' }),
      api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `INVOICE_CASES!A${_row}:Z${_row}` }),
    ])

    const headers = (hdrRes.data.values?.[0] ?? []) as string[]
    const current = [...((rowRes.data.values?.[0] ?? []) as string[])]
    while (current.length < headers.length) current.push('')

    const set = (f: string, v: string) => { const i = headers.indexOf(f); if (i >= 0) current[i] = v }
    set('bank_client_name',  bank_name)
    set('bank_confirmed_yn', 'Y')
    set('recon_status',      'MATCHED')
    set('updated_at',        new Date().toISOString())

    await api.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `INVOICE_CASES!A${_row}:Z${_row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [current] },
    })

    // Save name mapping for future auto-matching
    if (save_mapping && prypco_name && bank_name) {
      try {
        await api.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'NAME_MAPPINGS!A:D',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[
            prypco_name.toLowerCase().trim(),
            bank_name.toLowerCase().trim(),
            bank,
            new Date().toISOString(),
          ]]},
        })
      } catch {}
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
