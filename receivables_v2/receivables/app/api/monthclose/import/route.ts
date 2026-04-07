import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

const LEDGER_SHEET_ID = process.env.GOOGLE_SHEET_ID!

const CASE_HEADERS = [
  'invoice_no','client_name','bank_client_name','bank','month',
  'channel','finance_channel','customer_segment',
  'disbursal_amount','disbursal_amount_bank',
  'bank_confirmed_yn','commission_amount','gross_income',
  'include_in_invoice','include_in_incentives',
  'bank_ref','rejection_reason','td_status','td_source',
  'mis_source','recon_status','created_at','updated_at',
]

const BANK_MAP: Record<string, string> = {
  'adib':'ADIB','abu dhabi islamic':'ADIB',
  'adcb':'ADCB','abu dhabi commercial':'ADCB',
  'enbd':'ENBD','emirates nbd':'ENBD',
  'fab':'FAB','first abu dhabi':'FAB',
  'dib':'DIB','dubai islamic':'DIB',
  'cbd':'CBD','commercial bank of dubai':'CBD',
  'hsbc':'HSBC',
  'mashreq':'MASHREQ',
  'rak':'RAK','rakbank':'RAK','rak bank':'RAK',
  'nbf':'NBF','national bank of fujairah':'NBF',
  'scb':'SCB','standard chartered':'SCB',
  'uab':'UAB','united arab bank':'UAB',
  'al hilal':'AL_HILAL','hilal':'AL_HILAL',
  'ajman':'AJMAN',
  'arab bank':'ARAB',
  'bank of baroda':'BOB','baroda':'BOB',
  'sib':'SIB','sharjah islamic':'SIB',
  'eib':'EIB','emirates islamic':'EIB',
}

function parseAED(val: unknown): number | string {
  if (val == null || val === '') return ''
  // Remove commas (e.g. "411,000" → "411000"), then parse
  const clean = String(val).replace(/,/g, '').trim()
  const n = parseFloat(clean)
  return isNaN(n) ? '' : n
}

function normBank(name: string): string {
  const lower = name.toLowerCase().trim()
  for (const [key, val] of Object.entries(BANK_MAP)) {
    if (lower.includes(key)) return val
  }
  return name.toUpperCase().trim()
}

function normName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim()
}

function fuzzy(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const ta = new Set(a.split(' ').filter(t => t.length > 1))
  const tb = new Set(b.split(' ').filter(t => t.length > 1))
  if (!ta.size || !tb.size) return 0
  let m = 0; ta.forEach(t => { if (tb.has(t)) m++ })
  return m / Math.max(ta.size, tb.size)
}

// POST /api/monthclose/import
// Body: { sheetId: string, month: string }
export async function POST(req: NextRequest) {
  try {
    const { sheetId, month } = await req.json()
    if (!sheetId || !month) return NextResponse.json({ error: 'sheetId and month required' }, { status: 400 })

    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Read MIS sheet (the uploaded Consolidated sheet)
    // Note: service account must have read access to the MIS sheet
    let misData: string[][]
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'Consolidated!A1:AV500',
      })
      misData = (res.data.values ?? []) as string[][]
    } catch (e) {
      return NextResponse.json({
        error: `Cannot read MIS sheet. Make sure it is shared with: ${process.env.SERVICE_ACCOUNT_EMAIL || 'the service account'}. Error: ${String(e)}`
      }, { status: 400 })
    }

    // Find header row — look for row with Client Name + Bank + Channel
    let headerRowIdx = -1
    for (let i = 0; i < Math.min(10, misData.length); i++) {
      const rowStr = misData[i].join('|').toLowerCase()
      if (rowStr.includes('client name') && rowStr.includes('bank') && rowStr.includes('channel')) {
        headerRowIdx = i
        break
      }
    }
    if (headerRowIdx < 0) return NextResponse.json({ error: 'Could not find header row in Consolidated sheet' }, { status: 400 })

    const headers  = misData[headerRowIdx].map(h => String(h).trim().replace(/\n/g, ' '))
    const dataRows = misData.slice(headerRowIdx + 1)

    // Column finder
    const col = (name: string) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()))
    const exactCol = (name: string) => headers.findIndex(h => h.trim() === name)

    const colMap = {
      sn:              col('SN'),
      clientName:      col('Client Name'),
      bank:            exactCol('Bank'),
      channel:         exactCol('Channel'),
      financeChannel:  col('Finance Channel'),
      customerSegment: col('Customer Segment'),
      disbAmt:         col('Disbursal Amt as per Business'),
      disbAmtBank:     col('Disbursal Amt as per Banks'),
      confirmedYN:     col('Confirmed by Bank'),
      clientNameBank:  col('Client Name_As per Bank'),
      commsAmt:        col('Comms Payout Amt (Income)'),
      grossIncome:     exactCol('Gross Income'),
      forFinance:      col("considered for Finance"),
      forIncentives:   col("considered for Team Incentive"),
    }

    // Get existing cases for this month to avoid duplicates
    const existingRes = await sheets.spreadsheets.values.get({
      spreadsheetId: LEDGER_SHEET_ID,
      range: 'INVOICE_CASES!A2:W',
    })
    const existingRows = (existingRes.data.values ?? []) as string[][]

    // Get case headers
    const caseHdrRes = await sheets.spreadsheets.values.get({
      spreadsheetId: LEDGER_SHEET_ID,
      range: 'INVOICE_CASES!A1:W1',
    })
    const caseHeaders = (caseHdrRes.data.values?.[0] ?? []) as string[]

    function ci(f: string) { return caseHeaders.indexOf(f) }

    // Build existing lookup by bank → [{name, amount}]
    const existingByBank: Record<string, {name: string, amount: number}[]> = {}
    existingRows.forEach(r => {
      const b = String(r[ci('bank')] || '')
      const m = String(r[ci('month')] || '')
      if (m !== month) return
      if (!existingByBank[b]) existingByBank[b] = []
      existingByBank[b].push({
        name: normName(String(r[ci('client_name')] || '')),
        amount: Number(String(r[ci('disbursal_amount')] || '0').replace(/,/g,'')) || 0,
      })
    })

    // Process MIS rows
    const now         = new Date().toISOString()
    const newRows: string[][] = []
    const bankCounts: Record<string, number> = {}
    let added = 0, skipped = 0

    dataRows.forEach(row => {
      // Skip non-data rows
      if (colMap.sn >= 0 && isNaN(parseFloat(String(row[colMap.sn] || '')))) return

      const clientName = colMap.clientName >= 0 ? String(row[colMap.clientName] || '').trim() : ''
      const bankRaw    = colMap.bank       >= 0 ? String(row[colMap.bank]       || '').trim() : ''

      if (!clientName || !bankRaw) return

      const bank       = normBank(bankRaw)
      const clientNorm = normName(clientName)

      // Check duplicate: same client + same amount = duplicate
      // Same client + different amount = different case (e.g. two loans)
      const disbAmt = colMap.disbAmt >= 0 ? parseFloat(String(row[colMap.disbAmt] || '0').replace(/,/g, '')) || 0 : 0
      const existingForBank = existingByBank[bank] || []
      const isDup = existingForBank.some(e => {
        const nameMatch = fuzzy(e.name, clientNorm) > 0.82
        if (!nameMatch) return false
        // Same name — check if amount also matches (same case)
        if (e.amount && disbAmt && Math.abs(e.amount - disbAmt) > 1) return false // different amounts = different case
        return true
      })
      if (isDup) { skipped++; return }

      // Build row
      const caseRow = new Array(CASE_HEADERS.length).fill('')
      const set = (f: string, v: unknown) => {
        const i = CASE_HEADERS.indexOf(f)
        if (i >= 0) caseRow[i] = v != null ? String(v) : ''
      }

      set('client_name',           clientName)
      set('bank',                  bank)
      set('month',                 month)
      set('channel',               colMap.channel        >= 0 ? row[colMap.channel]        : '')
      set('finance_channel',       colMap.financeChannel >= 0 ? row[colMap.financeChannel] : '')
      set('customer_segment',      colMap.customerSegment>= 0 ? row[colMap.customerSegment]: '')
      set('disbursal_amount',      colMap.disbAmt        >= 0 ? parseAED(row[colMap.disbAmt]) : '')
      set('disbursal_amount_bank', colMap.disbAmtBank    >= 0 ? row[colMap.disbAmtBank]    : '')
      set('bank_confirmed_yn',     colMap.confirmedYN    >= 0 ? row[colMap.confirmedYN]    : '')
      set('bank_client_name',      colMap.clientNameBank >= 0 ? row[colMap.clientNameBank] : '')
      set('commission_amount',     colMap.commsAmt       >= 0 ? parseAED(row[colMap.commsAmt]) : '')
      set('gross_income',          colMap.grossIncome    >= 0 ? parseAED(row[colMap.grossIncome]) : '')
      set('include_in_invoice',    colMap.forFinance     >= 0 ? row[colMap.forFinance]     : '')
      set('include_in_incentives', colMap.forIncentives  >= 0 ? row[colMap.forIncentives]  : '')
      set('mis_source',            sheetId.substring(0, 20) + '_' + month)
      set('recon_status',          'PRYPCO_ONLY')
      set('created_at',            now)
      set('updated_at',            now)

      newRows.push(caseRow)
      added++
      bankCounts[bank] = (bankCounts[bank] || 0) + 1

      // Add to existing lookup to prevent intra-batch duplicates
      if (!existingByBank[bank]) existingByBank[bank] = []
      existingByBank[bank].push({ name: clientNorm, amount: disbAmt })
    })

    // Write all rows at once
    if (newRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: LEDGER_SHEET_ID,
        range: 'INVOICE_CASES!A:W',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newRows },
      })
    }

    const bankSummary = Object.entries(bankCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([bank, count]) => `${bank}: ${count}`)
      .join('\n')

    return NextResponse.json({ added, skipped, bankSummary })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
