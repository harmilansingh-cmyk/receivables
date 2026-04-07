import { NextRequest, NextResponse } from 'next/server'

const SCRIPT_ID = process.env.APPS_SCRIPT_ID

async function runScript(fn: string, params: unknown[]) {
  const { google } = await import('googleapis')
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth  = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/script.projects'] })
  const client = await auth.getClient() as { getAccessToken: () => Promise<{token:string}> }
  const token  = await client.getAccessToken()
  const res = await fetch(`https://script.googleapis.com/v1/scripts/${SCRIPT_ID}:run`, {
    method:'POST', headers:{'Authorization':`Bearer ${token.token}`,'Content-Type':'application/json'},
    body: JSON.stringify({ function:fn, parameters:params, devMode:false }),
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { bank, month, invoice_no, pdf_base64, pdf_filename } = await req.json()
    if (!bank||!month||!invoice_no) return NextResponse.json({ error:'bank, month, invoice_no required' }, { status:400 })
    if (!SCRIPT_ID) return NextResponse.json({ ok:false, manual:true, message:`Run sendInvoiceOnThread("${bank}","${month}","${invoice_no}") in Apps Script.` })
    const data = await runScript('sendInvoiceOnThread', [bank, month, invoice_no, pdf_base64||'', pdf_filename||`Invoice_${invoice_no}.pdf`])
    if (data.error) return NextResponse.json({ ok:false, error:data.error.message })
    return NextResponse.json({ ok:true })
  } catch(e) { return NextResponse.json({ ok:false, error:String(e) }) }
}
