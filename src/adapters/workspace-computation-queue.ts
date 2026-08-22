import { Worker } from 'node:worker_threads'
import {
  computeWorkspaceFingerprintFromSnapshot,
  type WorkspaceSnapshot,
} from './workspace-fingerprint.js'

interface PendingJob {
  id: number
  workspaceRoot: string
  ignoreScopes: string[]
  resolve(snapshot: WorkspaceSnapshot): void
  reject(error: Error): void
}

interface WorkerReply {
  id: number
  snapshot?: WorkspaceSnapshot
  error?: string
}

// A persistent one-worker pool is fed by an explicit FIFO below. Only one
// filesystem walk is posted at a time, so multiple DPS calls cannot fan out
// hashing work across cores or block the Desktop renderer event loop.
const WORKER_SOURCE = String.raw`
import { parentPort } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { join, matchesGlob, relative, resolve, sep } from 'node:path'

function normalizeScope(scope) {
  const normalized = scope.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
  if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Unsafe fingerprint ignore scope: ' + scope)
  }
  return normalized
}

function isIgnored(path, scopes) {
  return scopes.some((scope) => {
    if (scope.endsWith('/**')) {
      const prefix = scope.slice(0, -3)
      if (path === prefix || path.startsWith(prefix + '/')) return true
    }
    return matchesGlob(path, scope)
  })
}

function snapshot(workspaceRoot, ignoreScopes) {
  const root = realpathSync(resolve(workspaceRoot))
  const scopes = ignoreScopes.map(normalizeScope)
  const result = {}
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolutePath = join(directory, name)
      const workspacePath = relative(root, absolutePath).split(sep).join('/')
      if (isIgnored(workspacePath, scopes)) continue
      const stat = lstatSync(absolutePath)
      if (stat.isSymbolicLink()) {
        result[workspacePath] = 'symlink:' + createHash('sha256').update(readlinkSync(absolutePath)).digest('hex')
      } else if (stat.isDirectory()) {
        walk(absolutePath)
      } else if (stat.isFile()) {
        result[workspacePath] = 'file:' + createHash('sha256').update(readFileSync(absolutePath)).digest('hex')
      }
    }
  }
  walk(root)
  return result
}

parentPort.on('message', (job) => {
  try {
    parentPort.postMessage({ id: job.id, snapshot: snapshot(job.workspaceRoot, job.ignoreScopes) })
  } catch (error) {
    parentPort.postMessage({ id: job.id, error: error instanceof Error ? error.message : String(error) })
  }
})
`

export class WorkspaceComputationQueue {
  private worker: Worker | undefined
  private nextId = 1
  private readonly queued: PendingJob[] = []
  private active: PendingJob | undefined

  snapshot(workspaceRoot: string, ignoreScopes: string[]): Promise<WorkspaceSnapshot> {
    const id = this.nextId
    this.nextId += 1
    return new Promise<WorkspaceSnapshot>((resolve, reject) => {
      this.queued.push({ id, workspaceRoot, ignoreScopes: [...ignoreScopes], resolve, reject })
      this.dispatchNext()
    })
  }

  async fingerprint(workspaceRoot: string, ignoreScopes: string[]): Promise<string> {
    const snapshot = await this.snapshot(workspaceRoot, ignoreScopes)
    return computeWorkspaceFingerprintFromSnapshot(workspaceRoot, snapshot)
  }

  async dispose(): Promise<void> {
    const worker = this.worker
    this.worker = undefined
    const error = new Error('Workspace computation queue disposed')
    this.active?.reject(error)
    this.active = undefined
    for (const job of this.queued.splice(0)) job.reject(error)
    if (worker) await worker.terminate()
  }

  private dispatchNext(): void {
    if (this.active || this.queued.length === 0) return
    const job = this.queued.shift()!
    this.active = job
    const worker = this.ensureWorker()
    worker.ref()
    worker.postMessage({
      id: job.id,
      workspaceRoot: job.workspaceRoot,
      ignoreScopes: job.ignoreScopes,
    })
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const workerUrl = new URL(`data:text/javascript,${encodeURIComponent(WORKER_SOURCE)}`)
    const worker = new Worker(workerUrl, { name: 'dungeon-workspace-queue' })
    worker.unref()
    worker.on('message', (reply: WorkerReply) => {
      const job = this.active
      if (!job || job.id !== reply.id) return
      this.active = undefined
      if (reply.error !== undefined) job.reject(new Error(reply.error))
      else if (reply.snapshot !== undefined) job.resolve(reply.snapshot)
      else job.reject(new Error('Workspace computation worker returned no snapshot'))
      if (this.queued.length === 0) worker.unref()
      this.dispatchNext()
    })
    const fail = (error: Error) => {
      if (this.worker === worker) this.worker = undefined
      this.active?.reject(error)
      this.active = undefined
      for (const job of this.queued.splice(0)) job.reject(error)
    }
    worker.on('error', fail)
    worker.on('exit', (code) => {
      if (code !== 0 && this.worker === worker) fail(new Error(`Workspace computation worker exited with code ${code}`))
    })
    this.worker = worker
    return worker
  }
}

/** Process-wide FIFO: isolated Agent realms share one CPU work queue. */
export const workspaceComputationQueue = new WorkspaceComputationQueue()
