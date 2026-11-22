import { AppNav } from '@/features/nav'
import type { ReactNode } from 'react'

export default function MainLayout({ children }: { children: ReactNode }) {
  return <AppNav>{children}</AppNav>
}
