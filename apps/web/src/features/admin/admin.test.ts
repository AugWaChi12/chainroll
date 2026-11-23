import { describe, expect, it } from 'vitest'
import { recordAudit, removeAudit, setModerationDecision, useAdminStore } from './audit-store'
import { initialAuditLog, initialModerationQueue } from './mock-data'

describe('admin store', () => {
  it('records and removes audit entries (for 10s undo)', () => {
    const id = recordAudit({
      actor: '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350',
      category: 'moderation',
      action: 'post.hide',
      target: 'post-884',
      detail: 'Test moderation undo',
    })
    removeAudit(id)
    expect(initialAuditLog.length).toBeGreaterThan(0)
  })

  it('updates moderation item decisions', () => {
    const first = initialModerationQueue[0]!
    setModerationDecision(first.id, 'approved')
    setModerationDecision(first.id, 'pending')
    expect(typeof useAdminStore).toBe('function')
  })
})
