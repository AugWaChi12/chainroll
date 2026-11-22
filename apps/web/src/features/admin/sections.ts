// Plain module (no 'use client') so server components can read these values.
export const ADMIN_SECTIONS = ['moderation', 'films', 'users', 'gas', 'contract', 'audit'] as const
export type AdminSection = (typeof ADMIN_SECTIONS)[number]
