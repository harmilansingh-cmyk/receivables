import { NextResponse } from 'next/server'
import { getPositions } from '@/lib/sheets'

export async function GET() {
  try {
    const positions = await getPositions()
    return NextResponse.json(positions)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
