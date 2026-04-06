import { google } from 'googleapis'

// ── Auth ────────────────────────────────────────────────────
function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!
  const creds = JSON.parse(key)
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function sheets() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

// ── Types ───────────────────────────────────────────────────
export type PipelineStatus =
  | 'Draft'
  | 'Sent'
  | 'Bank Review'
  | 'Perfected'
  | 'Payment Pending'
  | 'Paid'
  | 'Superseded'

export type InvoiceType = 'monthly' | 'top_up' | 'quarterly_contest'

export interface Invoice {
  invoice_no: string
  parent_invoice_no: string
  invoice_type: InvoiceType
  bank: string
  month: string
  invoice_date: string
  sent_date: string
  calculated_amount: number
  confirmed_amount: number
  balance_outstanding: number
  pipeline_status: PipelineStatus
  perfected_amount: number
  perfected_cases: number
  total_cases: number
  payment_date: string
  payment_amount: number
  bank_comment: string
  td_notes: string
  split_date: string
  split_reason: string
  ageing_days: number
  created_at: string
  updated_at: string
  _row: number
}

export interface Bank {
  bank: string
  full_name: string
  ap_email: string
  cc_emails: string
  portal_yn: string
  portal_url: string
  payment_terms_days: number
  chase_after_days: number
  rm_name: string
  td_required_yn: string
  vat_inclusive_yn: string
  active_yn: string
}

export interface Position {
  bank: string
  month: string
  total_invoiced: number
  total_perfected: number
  total_paid: number
  balance_outstanding: number
  dominant_status: PipelineStatus
  invoice_count: number
  last_updated: string
}

// ── Helpers ─────────────────────────────────────────────────
function n(v: unknown): number {
  const x = Number(v)
  return isNaN(x) ? 0 : x
}

function s(v: unknown): string {
  return v == null ? '' : String(v)
}

function ageingDays(sentDate: string, paymentDate: string, status: PipelineStatus): number {
  if (!sentDate) return 0
  const end = status === 'Paid' && paymentDate ? new Date(paymentDate) : new Date()
  const start = new Date(sentDate)
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000))
}

function rowToInvoice(row: unknown[], rowIndex: number): Invoice {
  const r = row as string[]
  const sentDate = s(r[6])
  const paymentDate = s(r[14])
  const status = s(r[10]) as PipelineStatus

  return {
    invoice_no: s(r[0]),
    parent_invoice_no: s(r[1]),
    invoice_type: (s(r[2]) || 'monthly') as InvoiceType,
    bank: s(r[3]),
    month: s(r[4]),
    invoice_date: s(r[5]),
    sent_date: sentDate,
    calculated_amount: n(r[7]),
    confirmed_amount: n(r[8]),
    balance_outstanding: n(r[9]),
    pipeline_status: status,
    perfected_amount: n(r[11]),
    perfected_cases: n(r[12]),
    total_cases: n(r[13]),
    payment_date: paymentDate,
    payment_amount: n(r[15]),
    bank_comment: s(r[16]),
    td_notes: s(r[17]),
    split_date: s(r[18]),
    split_reason: s(r[19]),
    ageing_days: ageingDays(sentDate, paymentDate, status),
    created_at: s(r[21]),
    updated_at: s(r[22]),
    _row: rowIndex,
  }
}

function invoiceToRow(inv: Partial<Invoice>): (string | number)[] {
  return [
    inv.invoice_no ?? '',
    inv.parent_invoice_no ?? '',
    inv.invoice_type ?? 'monthly',
    inv.bank ?? '',
    inv.month ?? '',
    inv.invoice_date ?? '',
    inv.sent_date ?? '',
    inv.calculated_amount ?? 0,
    inv.confirmed_amount ?? 0,
    inv.balance_outstanding ?? 0,
    inv.pipeline_status ?? 'Draft',
    inv.perfected_amount ?? 0,
    inv.perfected_cases ?? 0,
    inv.total_cases ?? 0,
    inv.payment_date ?? '',
    inv.payment_amount ?? 0,
    inv.bank_comment ?? '',
    inv.td_notes ?? '',
    inv.split_date ?? '',
    inv.split_reason ?? '',
    '',
    inv.created_at ?? new Date().toISOString(),
    new Date().toISOString(),
  ]
}

// ── LEDGER reads ─────────────────────────────────────────────
export async function getLedger(): Promise<Invoice[]> {
  const api = sheets()
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'LEDGER!A2:W',
  })
  const rows = res.data.values ?? []
  return rows
    .map((row, i) => rowToInvoice(row, i + 2))
    .filter(inv => inv.invoice_no !== '')
}

export async function getInvoice(invoiceNo: string): Promise<Invoice | null> {
  const all = await getLedger()
  return all.find(inv => inv.invoice_no === invoiceNo) ?? null
}

// ── LEDGER writes ────────────────────────────────────────────
export async function appendInvoice(inv: Partial<Invoice>): Promise<void> {
  const api = sheets()
  const row = invoiceToRow({ ...inv, created_at: new Date().toISOString() })
  await api.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'LEDGER!A:W',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  })
}

export async function updateInvoiceRow(rowIndex: number, fields: Partial<Invoice>): Promise<void> {
  const api = sheets()
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `LEDGER!A${rowIndex}:W${rowIndex}`,
  })
  const current = (res.data.values?.[0] ?? []) as unknown[]
  const currentInv = rowToInvoice(current, rowIndex)
  const merged = { ...currentInv, ...fields }
  const row = invoiceToRow(merged)

  await api.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `LEDGER!A${rowIndex}:W${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  })
}

// ── SPLIT ────────────────────────────────────────────────────
export async function splitInvoice(params: {
  parentInvoiceNo: string
  child1: { invoice_no: string; confirmed_amount: number; perfected_amount: number; perfected_cases: number; total_cases: number }
  child2: { invoice_no: string; confirmed_amount: number; perfected_amount: number; perfected_cases: number; total_cases: number }
  split_reason: string
}): Promise<void> {
  const parent = await getInvoice(params.parentInvoiceNo)
  if (!parent) throw new Error(`Invoice ${params.parentInvoiceNo} not found`)

  const splitDate = new Date().toISOString().split('T')[0]

  await updateInvoiceRow(parent._row, {
    pipeline_status: 'Superseded',
    split_date: splitDate,
    split_reason: params.split_reason,
  })

  await appendInvoice({
    ...parent,
    invoice_no: params.child1.invoice_no,
    parent_invoice_no: parent.invoice_no,
    confirmed_amount: params.child1.confirmed_amount,
    perfected_amount: params.child1.perfected_amount,
    perfected_cases: params.child1.perfected_cases,
    total_cases: params.child1.total_cases,
    balance_outstanding: params.child1.confirmed_amount,
    pipeline_status: 'Perfected',
    split_date: splitDate,
    split_reason: params.split_reason,
    payment_date: '',
    payment_amount: 0,
    created_at: new Date().toISOString(),
  })

  await appendInvoice({
    ...parent,
    invoice_no: params.child2.invoice_no,
    parent_invoice_no: parent.invoice_no,
    confirmed_amount: params.child2.confirmed_amount,
    perfected_amount: params.child2.perfected_amount,
    perfected_cases: params.child2.perfected_cases,
    total_cases: params.child2.total_cases,
    balance_outstanding: params.child2.confirmed_amount,
    pipeline_status: 'Bank Review',
    split_date: splitDate,
    split_reason: params.split_reason,
    payment_date: '',
    payment_amount: 0,
    created_at: new Date().toISOString(),
  })
}

// ── BANK_MASTER ──────────────────────────────────────────────
export async function getBanks(): Promise<Bank[]> {
  const api = sheets()
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'BANK_MASTER!A2:L',
  })
  const rows = res.data.values ?? []
  return rows
    .filter(r => r[0])
    .map(r => ({
      bank: s(r[0]),
      full_name: s(r[1]),
      ap_email: s(r[2]),
      cc_emails: s(r[3]),
      portal_yn: s(r[4]),
      portal_url: s(r[5]),
      payment_terms_days: n(r[6]),
      chase_after_days: n(r[7]),
      rm_name: s(r[8]),
      td_required_yn: s(r[9]),
      vat_inclusive_yn: s(r[10]),
      active_yn: s(r[11]),
    }))
}

// ── POSITIONS ────────────────────────────────────────────────
export async function getPositions(): Promise<Position[]> {
  const api = sheets()
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'POSITIONS!A2:I',
  })
  const rows = res.data.values ?? []
  return rows
    .filter(r => r[0])
    .map(r => ({
      bank: s(r[0]),
      month: s(r[1]),
      total_invoiced: n(r[2]),
      total_perfected: n(r[3]),
      total_paid: n(r[4]),
      balance_outstanding: n(r[5]),
      dominant_status: s(r[6]) as PipelineStatus,
      invoice_count: n(r[7]),
      last_updated: s(r[8]),
    }))
}
