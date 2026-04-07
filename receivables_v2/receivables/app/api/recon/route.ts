import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth  = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  return google.sheets({ version: 'v4', auth })
}
const SID = process.env.GOOGLE_SHEET_ID!

function parseNum(v: unknown) {
  return parseFloat(String(v||'').replace(/,/g,'')) || 0
}

async function readSheet(api: ReturnType<typeof getSheets>, range: string) {
  const res = await api.spreadsheets.values.get({ spreadsheetId: SID, range, valueRenderOption: 'UNFORMATTED_VALUE' as any })
  const rows = res.data.values ?? []
  if (rows.length < 2) return []
  const headers = rows[0] as string[]
  return rows.slice(1).map((r, i) => {
    const obj: Record<string,unknown> = { _row: i + 2 }
    headers.forEach((h, j) => { obj[h] = r[j] ?? '' })
    return obj
  })
}

// GET /api/recon?bank=ADIB&month=2026-03
// Returns INVOICE_CASES, BANK_CASES, CASE_MATCHES for this bank+month
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const bank  = searchParams.get('bank')
    const month = searchParams.get('month')

    const api = getSheets()
    const [prypco, bankCases, matches] = await Promise.all([
      readSheet(api, 'INVOICE_CASES!A:R'),
      readSheet(api, 'BANK_CASES!A:M'),
      readSheet(api, 'CASE_MATCHES!A:M'),
    ])

    const filteredP = prypco.filter(r =>
      (!bank  || r.bank  === bank) &&
      (!month || r.month === month)
    )
    const filteredB = bankCases.filter(r =>
      (!bank  || r.bank  === bank) &&
      (!month || r.month === month)
    )

    // Get match_ids relevant to this bank+month
    const matchIds = new Set([
      ...filteredP.map(r => r.match_id as string),
      ...filteredB.map(r => r.match_id as string),
    ].filter(Boolean))

    const filteredM = matches.filter(r => matchIds.has(r.match_id as string))

    // Summary stats
    const total_prypco    = filteredP.length
    const total_bank      = filteredB.length
    const confirmed       = filteredM.filter(r => r.status === 'CONFIRMED').length
    const pending_review  = filteredM.filter(r => r.status === 'PENDING_REVIEW').length
    const unmatched_p     = filteredP.filter(r => !r.match_id || r.match_status === 'UNMATCHED').length
    const unmatched_b     = filteredB.filter(r => !r.match_id || r.match_status === 'UNMATCHED').length

    return NextResponse.json({
      prypco:   filteredP,
      bankCases: filteredB,
      matches:  filteredM,
      summary: { total_prypco, total_bank, confirmed, pending_review, unmatched_p, unmatched_b },
    })
  } catch(e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/recon — manual match or confirm/reject auto-match
// Body: { action: 'manual_match' | 'confirm' | 'reject', case_id, bank_case_id, match_id }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body
    const api = getSheets()
    const now = new Date().toISOString()

    if (action === 'manual_match') {
      const { case_id, bank_case_id } = body
      if (!case_id || !bank_case_id) return NextResponse.json({ error: 'case_id and bank_case_id required' }, { status: 400 })

      // Read both sheets to find rows
      const [icData, bcData, cmData] = await Promise.all([
        api.spreadsheets.values.get({ spreadsheetId: SID, range: 'INVOICE_CASES!A:R' }),
        api.spreadsheets.values.get({ spreadsheetId: SID, range: 'BANK_CASES!A:M' }),
        api.spreadsheets.values.get({ spreadsheetId: SID, range: 'CASE_MATCHES!A:M' }),
      ])

      const icHdrs = icData.data.values?.[0] as string[] ?? []
      const bcHdrs = bcData.data.values?.[0] as string[] ?? []
      const cmHdrs = cmData.data.values?.[0] as string[] ?? []

      const icRows = icData.data.values?.slice(1) ?? []
      const bcRows = bcData.data.values?.slice(1) ?? []

      const matchId = `MATCH-${Date.now()}-MANUAL`

      // Find and update PRYPCO row
      const icIdx = icRows.findIndex(r => String(r[icHdrs.indexOf('case_id')]) === case_id)
      if (icIdx >= 0) {
        const rowNum = icIdx + 2
        await api.spreadsheets.values.batchUpdate({
          spreadsheetId: SID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: [
            { range: `INVOICE_CASES!M${rowNum}`, values: [[matchId]] },
            { range: `INVOICE_CASES!N${rowNum}`, values: [['MANUAL_MATCH']] },
            { range: `INVOICE_CASES!R${rowNum}`, values: [[now]] },
          ]},
        })
      }

      // Find bank row — get bank/month for CASE_MATCHES
      const bcIdx = bcRows.findIndex(r => String(r[bcHdrs.indexOf('bank_case_id')]) === bank_case_id)
      let bank = '', month = ''
      if (bcIdx >= 0) {
        const rowNum = bcIdx + 2
        bank  = String(bcRows[bcIdx][bcHdrs.indexOf('bank')]  || '')
        month = String(bcRows[bcIdx][bcHdrs.indexOf('month')] || '')
        await api.spreadsheets.values.batchUpdate({
          spreadsheetId: SID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: [
            { range: `BANK_CASES!I${rowNum}`, values: [[matchId]] },
            { range: `BANK_CASES!J${rowNum}`, values: [['MANUAL_MATCH']] },
            { range: `BANK_CASES!M${rowNum}`, values: [[now]] },
          ]},
        })
      }

      // Append to CASE_MATCHES
      const cmRow = new Array(cmHdrs.length).fill('')
      const setm  = (f: string, v: string) => { const i = cmHdrs.indexOf(f); if (i>=0) cmRow[i]=v }
      setm('match_id',    matchId)
      setm('case_id',     case_id)
      setm('bank_case_id',bank_case_id)
      setm('bank',        bank)
      setm('month',       month)
      setm('match_type',  'MANUAL')
      setm('confidence',  '100')
      setm('matched_by',  'haitham')
      setm('status',      'CONFIRMED')
      setm('matched_at',  now)

      await api.spreadsheets.values.append({
        spreadsheetId: SID, range: 'CASE_MATCHES!A:M',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [cmRow] },
      })

      return NextResponse.json({ ok: true, match_id: matchId })

    } else if (action === 'confirm' || action === 'reject') {
      const { match_id } = body
      const newStatus = action === 'confirm' ? 'CONFIRMED' : 'REJECTED'

      // Update CASE_MATCHES row
      const cmData = await api.spreadsheets.values.get({ spreadsheetId: SID, range: 'CASE_MATCHES!A:M' })
      const cmHdrs = cmData.data.values?.[0] as string[] ?? []
      const cmRows = cmData.data.values?.slice(1) ?? []
      const cmIdx  = cmRows.findIndex(r => String(r[cmHdrs.indexOf('match_id')]) === match_id)

      if (cmIdx >= 0) {
        const rowNum = cmIdx + 2
        const caseId     = String(cmRows[cmIdx][cmHdrs.indexOf('case_id')]     || '')
        const bankCaseId = String(cmRows[cmIdx][cmHdrs.indexOf('bank_case_id')]|| '')

        await api.spreadsheets.values.batchUpdate({
          spreadsheetId: SID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: [
            { range: `CASE_MATCHES!K${rowNum}`, values: [[newStatus]] },
          ]},
        })

        if (action === 'reject') {
          // Reset both rows to UNMATCHED so they appear in the manual linking queue
          const icData = await api.spreadsheets.values.get({ spreadsheetId: SID, range: 'INVOICE_CASES!A:R' })
          const icHdrs = icData.data.values?.[0] as string[] ?? []
          const icRows = icData.data.values?.slice(1) ?? []
          const icIdx  = icRows.findIndex(r => String(r[icHdrs.indexOf('case_id')]) === caseId)
          if (icIdx >= 0) {
            const r = icIdx + 2
            await api.spreadsheets.values.batchUpdate({
              spreadsheetId: SID,
              requestBody: { valueInputOption: 'USER_ENTERED', data: [
                { range: `INVOICE_CASES!M${r}`, values: [['']] },
                { range: `INVOICE_CASES!N${r}`, values: [['UNMATCHED']] },
              ]},
            })
          }

          const bcData = await api.spreadsheets.values.get({ spreadsheetId: SID, range: 'BANK_CASES!A:M' })
          const bcHdrs = bcData.data.values?.[0] as string[] ?? []
          const bcRows = bcData.data.values?.slice(1) ?? []
          const bcIdx  = bcRows.findIndex(r => String(r[bcHdrs.indexOf('bank_case_id')]) === bankCaseId)
          if (bcIdx >= 0) {
            const r = bcIdx + 2
            await api.spreadsheets.values.batchUpdate({
              spreadsheetId: SID,
              requestBody: { valueInputOption: 'USER_ENTERED', data: [
                { range: `BANK_CASES!I${r}`, values: [['']] },
                { range: `BANK_CASES!J${r}`, values: [['UNMATCHED']] },
              ]},
            })
          }
        }
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch(e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
