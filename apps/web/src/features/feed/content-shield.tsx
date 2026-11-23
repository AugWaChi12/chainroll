'use client'

import { useEffect } from 'react'

/**
 * Blocks right-click image copying, image dragging, mobile long-press save callouts,
 * and DevTools / View-Source / Save-Page keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S).
 */
export function ContentShield() {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (
        target.tagName === 'CANVAS' ||
        target.tagName === 'IMG' ||
        target.closest('[data-protected-frame]')
      ) {
        e.preventDefault()
      }
    }

    const onDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (
        target.tagName === 'CANVAS' ||
        target.tagName === 'IMG' ||
        target.closest('[data-protected-frame]')
      ) {
        e.preventDefault()
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const ctrlOrMeta = e.ctrlKey || e.metaKey

      // F12
      if (e.key === 'F12') {
        e.preventDefault()
        return
      }
      // Ctrl+Shift+I / J / C (Windows/Linux) or Cmd+Option+I / J / C (macOS)
      if (
        (e.ctrlKey && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
        (e.metaKey && e.altKey && (key === 'i' || key === 'j' || key === 'c'))
      ) {
        e.preventDefault()
        return
      }
      // Ctrl+U (View Source) or Ctrl+S (Save Page)
      if (ctrlOrMeta && (key === 'u' || key === 's')) {
        e.preventDefault()
      }
    }

    window.addEventListener('contextmenu', onContextMenu, { capture: true })
    window.addEventListener('dragstart', onDragStart, { capture: true })
    window.addEventListener('keydown', onKeyDown, { capture: true })

    return () => {
      window.removeEventListener('contextmenu', onContextMenu, { capture: true })
      window.removeEventListener('dragstart', onDragStart, { capture: true })
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [])

  return null
}
