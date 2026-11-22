'use client'

import { useEffect, useState } from 'react'

export type RollStage = 'shooting' | 'full' | 'developing' | 'developed'

/** Where a roll is in its life. `nowSec` is unix seconds. Pure — unit tested. */
export function rollStage(
  roll: { frames: number; framesUsed: number; developReadyAt: number },
  nowSec: number,
): RollStage {
  if (roll.developReadyAt > 0) return nowSec >= roll.developReadyAt ? 'developed' : 'developing'
  return roll.framesUsed >= roll.frames ? 'full' : 'shooting'
}

/** `mm:ss` (or `h:mm:ss`) until `targetSec`; "0:00" once passed. */
export function countdown(targetSec: number, nowSec: number): string {
  const left = Math.max(0, Math.floor(targetSec - nowSec))
  const h = Math.floor(left / 3600)
  const m = Math.floor((left % 3600) / 60)
  const s = left % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** Current unix time in seconds, re-rendering every `everyMs`. */
export function useNowSec(everyMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
