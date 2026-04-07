import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

// This endpoint triggers the Apps Script parseEmailsForMonth function
// via the Google Apps Script API

// POST /api/parseemails
// Body: { month: string } e.g. { month: "2026-03" }
export async function POST(req: NextRequest) {
  try {
    const { month } = await req.json()
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 })
    }

    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
    const auth  = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/script.projects',
        'https://www.googleapis.com/auth/script.external_request',
      ],
    })

    const scriptId = process.env.APPS_SCRIPT_ID

    if (!scriptId) {
      // Fallback: if no script ID configured, return instructions
      return NextResponse.json({
        ok: false,
        message: 'Apps Script not configured. Run parseEmailsForMonth("' + month + '") manually in Apps Script.',
        manual: true,
      })
    }

    // Call Apps Script via execution API
    const client  = await auth.getClient()
    const token   = await (client as { getAccessToken: () => Promise<{ token: string }> }).getAccessToken()

    const response = await fetch(
      `https://script.googleapis.com/v1/scripts/${scriptId}:run`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          function: 'parseEmailsForMonth',
          parameters: [month],
          devMode: false,
        }),
      }
    )

    const data = await response.json()

    if (data.error) {
      return NextResponse.json({
        ok: false,
        error: data.error.message || 'Apps Script error',
        manual: true,
        message: 'Run parseEmailsForMonth("' + month + '") manually in Apps Script.',
      })
    }

    const result = data.response?.result || {}
    return NextResponse.json({
      ok: true,
      month,
      emails_processed: result.processed || 0,
      cases_found: result.cases_found || 0,
      banks: result.banks || {},
    })

  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: String(e),
      manual: true,
      message: 'Run parseEmailsForMonth() manually in Apps Script for now.',
    })
  }
}
