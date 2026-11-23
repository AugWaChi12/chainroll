import { applyDbMutation, fetchAppStateFromDb, type DbMutationPayload } from '@/server/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await fetchAppStateFromDb()
    return NextResponse.json({ ok: true, dbConnected: true, ...data })
  } catch (err) {
    return NextResponse.json(
      { ok: false, dbConnected: false, error: err instanceof Error ? err.message : 'db error' },
      { status: 503 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as DbMutationPayload
    await applyDbMutation(payload)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'mutation failed' },
      { status: 500 },
    )
  }
}
