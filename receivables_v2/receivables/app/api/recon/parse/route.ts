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
    const { month } = await req.json()
    if (!month) return NextResponse.json({ error:'month required' }, { status:400 })
    if (!SCRIPT_ID) return NextResponse.json({ ok:false, manual:true, message:`Run parseReplies("${month}") in Apps Script.` })
    const data = await runScript('parseReplies', [month])
    if (data.error) return NextResponse.json({ ok:false, manual:true, error:data.error.message, message:`Run parseReplies("${month}") in Apps Script.` })
    return NextResponse.json({ ok:true, result:data.response?.result })
  } catch(e) { return NextResponse.json({ ok:false, manual:true, error:String(e), message:'Run parseReplies() in Apps Script.' }) }
}
