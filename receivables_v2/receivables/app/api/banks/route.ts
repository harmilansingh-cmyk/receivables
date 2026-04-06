import { NextResponse } from 'next/server'
import { getBanks } from '@/lib/sheets'

export async function GET() {
  try {
    const banks = await getBanks()
    return NextResponse.json(banks)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
