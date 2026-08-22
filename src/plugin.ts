import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as wireSchema } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'

import {
  DungeonService,
  defaultDungeonConfig,
  type DungeonConfig,
  type DungeonEventStore,
  type DungeonRun,
} from './service/dungeon-service.js'
import { PartyAgentManager } from './adapters/party-agent-manager.js'
import { SessionDungeonEventStore } from './adapters/session-event-store.js'
import { registerDungeonTools } from './tools/register.js'
import { registerDungeonSessionEventTypes } from './session-event-compat.js'

registerDungeonSessionEventTypes()

export interface DungeonPartyPluginConfig {
  dungeon?: Partial<DungeonConfig>
  eventStore?: DungeonEventStore
  /**
   * Explicit provider/model route for party child agents. The live model
   * selection of the commander session is context-scoped and not exposed on
   * the rc8 Agent API, so `{...tankAgent.options}` cannot capture a UI-side
   * model switch; configure childRoute to pin the whole party to one route.
   */
  childRoute?: { provider?: string; model?: string }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dungeonParty: DungeonPartyService
  }
}

declare module '@deepseek-ai/dsh-session-projection' {
  interface SessionProjectionStateMap {
    'dungeon-party': DungeonRun | null
  }
  interface SessionProjectionMap {
    'dungeon-party': DungeonRun | null
  }
}

export function applyDungeonProjection(state: DungeonRun | null, event: SessionEvent): DungeonRun | null {
  if (event.type !== 'dungeon/projection') return state
  return structuredClone(event.data as DungeonRun)
}

export const name = 'dungeon-party'
export const inject = ['tools', 'sessions', 'agents', 'agentPresets']

const positiveInteger = () => z.number().step(1).min(1)
export const Config = z.object({
  childRoute: z.object({
    provider: z.string(),
    model: z.string(),
  }),
  dungeon: z.object({
    scopeEnforcementMode: z.union(['auto', 'telemetry', 'aggregate', 'serial']),
    strictPerAgentWriteScopes: z.boolean(),
    maxConcurrentDps: positiveInteger(),
    maxRepairRounds: positiveInteger(),
    battleResCharges: z.number().step(1).min(0),
    commanderBattleResCharges: positiveInteger(),
    resurrectionTimeoutMs: positiveInteger(),
    commanderRescueTicketTtlMs: positiveInteger(),
    commanderResurrectionTimeoutMs: positiveInteger(),
    maxGenerationsPerSlot: positiveInteger(),
    chargeOnFailedResurrection: z.boolean(),
    progressCheckpointIntervalMs: positiveInteger(),
    checkpointResponseTimeoutMs: positiveInteger(),
    maxMissedCheckpoints: positiveInteger(),
    taskLeaseDurationMs: positiveInteger(),
    readinessEvaluationWindowMs: positiveInteger(),
    readinessWarningSignalCount: positiveInteger(),
    readinessCriticalSignalCount: positiveInteger(),
    commanderMaxPendingDecisions: positiveInteger(),
    commanderDecisionSlaMs: positiveInteger(),
    healerVerificationCommands: z.array(z.string()).default(['npm test', 'npm run typecheck', 'npx tsc --noEmit', 'git status --short', 'git diff --stat', 'git diff --numstat']),
    healerVerificationTimeoutMs: positiveInteger().default(120_000),
    fingerprintIgnoreScopes: z.array(z.string()).default([...defaultDungeonConfig.fingerprintIgnoreScopes]),
    validationRequired: z.boolean(),
  }),
})

export class DungeonPartyService extends Service {
  static inject = inject
  static Config = Config
  readonly core: DungeonService
  readonly agentManager: PartyAgentManager

  constructor(ctx: Context, config: DungeonPartyPluginConfig = {}) {
    super(ctx, 'dungeonParty')
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      const schema = wireSchema.custom<DungeonRun | null>((value) => value === null || (
        typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string'
      ))
      projectionCtx.sessionProjections.register({
        key: 'dungeon-party',
        stateSchema: schema,
        init: () => null,
        apply: applyDungeonProjection,
        wire: {
          viewSchema: schema,
          view: (state) => state,
        },
        stateVersion: 1,
      })
    })
    this.core = new DungeonService({
      eventStore: config.eventStore ?? new SessionDungeonEventStore(ctx.sessions),
      ...(config.dungeon ? { config: config.dungeon } : {}),
    })
    this.agentManager = new PartyAgentManager(this.core, ctx.agents, ctx.agentPresets, config.childRoute)
    const core = this.core
    const manager = this.agentManager
    const dispatchCommanderTickets = (runIds: string[]) => {
      for (const runId of new Set(runIds)) {
        const ticket = core.getRun(runId).commanderRescueTickets.find((item) => item.status === 'issued')
        if (ticket) manager.dispatchCommanderRescue(runId, ticket.ticketId)
      }
    }
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'turn/end') return
      const reason = event.data.reason
      const signals = core.observeAgentTurnEnd(String(session.id), reason.kind, [JSON.stringify(reason)])
      dispatchCommanderTickets(signals.map((signal) => signal.runId))
      manager.nudgeAfterTurnEnd(String(session.id))
    })
    // Periodic watchdog: expires stale leases, escalates stalled tasks, and
    // keeps dispatch moving even when no tool call kicks the scheduler.
    const watchdogTimer = setInterval(() => {
      void manager.runWatchdog().catch(() => undefined)
    }, 30_000)
    watchdogTimer.unref?.()
    ctx.effect(() => () => clearInterval(watchdogTimer), 'dungeon-party watchdog')
    ctx.on('agent/disposed', ({ agent }) => {
      manager.forgetDisposedAgent(String(agent.id))
      const runs = core.observeAgentDisposed(String(agent.id), 'runtime Agent disposed')
      dispatchCommanderTickets(runs.map((run) => run.id))
    })
    ctx.effect(() => () => manager.dispose(), 'dungeon-party agents')
    ctx.effect(() => registerDungeonTools(ctx, this.core, manager), 'dungeon-party tools')
  }
}

export default DungeonPartyService
