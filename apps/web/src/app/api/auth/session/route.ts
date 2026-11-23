import { getServerSession } from '@/server/auth/session'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ ok: true, authenticated: false, address: null, chainId: null })
  }
  return NextResponse.json({
    ok: true,
    authenticated: true,
    address: session.address,
    chainId: session.chainId,
  })
}
