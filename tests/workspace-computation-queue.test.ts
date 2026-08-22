import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkspaceComputationQueue } from '../src/adapters/workspace-computation-queue.js'
import { computeWorkspaceFingerprint, createWorkspaceSnapshot } from '../src/adapters/workspace-fingerprint.js'

const roots: string[] = []
const queues: WorkspaceComputationQueue[] = []

afterEach(async () => {
  await Promise.all(queues.splice(0).map((queue) => queue.dispose()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function workspace(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `dungeon-queue-${name}-`))
  roots.push(root)
  mkdirSync(join(root, 'src'))
  return root
}

describe('WorkspaceComputationQueue', () => {
  it('matches the canonical snapshot while running outside the caller event loop', async () => {
    const root = workspace('snapshot')
    writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 1\n')
    mkdirSync(join(root, '.npm-cache'))
    writeFileSync(join(root, '.npm-cache', 'cache.bin'), 'ignored')
    const queue = new WorkspaceComputationQueue()
    queues.push(queue)

    const pending = queue.snapshot(root, ['.npm-cache/**'])
    const first = await Promise.race([
      pending.then(() => 'snapshot' as const),
      new Promise<'event-loop'>((resolve) => setTimeout(() => resolve('event-loop'), 0)),
    ])

    expect(first).toBe('event-loop')
    await expect(pending).resolves.toEqual(createWorkspaceSnapshot(root, ['.npm-cache/**']))
    await expect(queue.fingerprint(root, ['.npm-cache/**'])).resolves.toBe(
      computeWorkspaceFingerprint(root, ['.npm-cache/**']),
    )
  })

  it('processes queued scans in FIFO order instead of fanning out CPU work', async () => {
    const firstRoot = workspace('first')
    const secondRoot = workspace('second')
    writeFileSync(join(firstRoot, 'src', 'large.bin'), Buffer.alloc(16 * 1024 * 1024, 1))
    writeFileSync(join(secondRoot, 'src', 'small.txt'), 'small')
    const queue = new WorkspaceComputationQueue()
    queues.push(queue)
    const completed: string[] = []

    const first = queue.snapshot(firstRoot, []).then((value) => { completed.push('first'); return value })
    const second = queue.snapshot(secondRoot, []).then((value) => { completed.push('second'); return value })
    await Promise.all([first, second])

    expect(completed).toEqual(['first', 'second'])
  })
})
