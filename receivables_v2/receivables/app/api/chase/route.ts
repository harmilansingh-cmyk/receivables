import { NextRequest, NextResponse } from 'next/server'
import { getLedger, getBanks } from '@/lib/sheets'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { bank } = await req.json()
    const [invoices, banks] = await Promise.all([getLedger(), getBanks()])

    const bankInfo = banks.find(b => b.bank === bank)
    if (!bankInfo) return NextResponse.json({ error: 'Bank not found' }, { status: 404 })

    // Only chase Perfected or Payment Pending — never Bank Review
    const chaseList = invoices.filter(
      i =>
        i.bank === bank &&
        (i.pipeline_status === 'Perfected' || i.pipeline_status === 'Payment Pending') &&
        i.balance_outstanding > 0
    )

    if (chaseList.length === 0) {
      return NextResponse.json({ noAction: true, draft: '' })
    }

    const totalOS = chaseList.reduce((s, i) => s + i.balance_outstanding, 0)

    const invoiceSummary = chaseList
      .map(
        i =>
          `Invoice ${i.invoice_no} | Month ${i.month} | AED ${i.balance_outstanding.toLocaleString()} | ${i.ageing_days} days outstanding${
            i.bank_comment ? ` | Bank note: ${i.bank_comment}` : ''
          }`
      )
      .join('\n')

    const prompt = `You are drafting a professional, concise payment follow-up email on behalf of PRYPCO Mortgage Finance.

Recipient: ${bankInfo.full_name} accounts payable team${bankInfo.rm_name ? ` (RM: ${bankInfo.rm_name})` : ''}.

Outstanding invoices:
${invoiceSummary}

Total outstanding: AED ${totalOS.toLocaleString()}

Instructions:
- Professional but warm tone — not aggressive or demanding
- Mention the total AED amount outstanding
- Reference each invoice number
- Ask for an ETA on payment or confirmation of receipt
- Keep under 150 words
- Output ONLY the email body — no subject line, no labels
- Start with: Dear ${bankInfo.rm_name ? bankInfo.rm_name : 'Team'},`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const draft = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const subject = `Payment Follow-up — PRYPCO Invoices | ${bank} | AED ${totalOS.toLocaleString()}`
    const primaryEmails = bankInfo.ap_email.split(',').map((e: string) => e.trim()).join(',')
    const mailto = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(bankInfo.ap_email)}&cc=${encodeURIComponent(bankInfo.cc_emails || '')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(draft)}`
    
    return NextResponse.json({
      draft,
      mailto,
      invoiceCount: chaseList.length,
      totalOS,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
