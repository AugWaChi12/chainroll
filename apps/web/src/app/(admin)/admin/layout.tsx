import { AdminShell } from '@/features/admin'
import type { ReactNode } from 'react'

export const metadata = { title: 'Darkroom Console' }

// TODO(M3): guard by role in proxy.ts + server check (PROJECT_BRIEF §10.6)
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
