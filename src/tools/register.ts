import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type JsonValue, type ToolRunContext } from '@deepseek-ai/dsh-tools'

import type { PartyAgentManager } from '../adapters/party-agent-manager.js'
import { computeWorkspaceFingerprint } from '../adapters/workspace-fingerprint.js'
import {
  DungeonError,
  type DpsCheckpoint,
  type DpsSlot,
  type ExecutionReport,
  type PartyMessageInput,
  type PartySlot,
  type RunPhase,
  type ValidationSubmission,
  type WorkOrder,
  type DungeonService,
} from '../service/dungeon-service.js'

function actor(exec: ToolRunContext): { sessionId: string } {
  if (!exec.agent) throw new DungeonError('FORBIDDEN', 'Dungeon tools require an authenticated DSH agent')
  return { sessionId: String(exec.agent.id) }
}

function json<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new DungeonError('INVALID_ARGS', `${field} must be an array of strings`)
  }
  return value
}

function normalizeWorkOrderDraft(value: Record<string, unknown>, runId: string, generatedId: string): WorkOrder {
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : generatedId
  const rawTitle = typeof value.title === 'string' ? value.title.trim() : ''
  const rawObjective = typeof value.objective === 'string' ? value.objective.trim() : ''
  const title = rawTitle || rawObjective
  const objective = rawObjective || rawTitle
  if (!title) throw new DungeonError('INVALID_ARGS', 'workOrder needs a title or objective')
  if (!Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length === 0) {
    throw new DungeonError('INVALID_ARGS', 'workOrder needs at least one acceptance criterion')
  }
  const acceptanceCriteria = value.acceptanceCriteria.map((criterion, index) => {
    const record = typeof criterion === 'object' && criterion !== null && !Array.isArray(criterion)
      ? criterion as Record<string, unknown>
      : undefined
    const description = typeof criterion === 'string'
      ? criterion.trim()
      : typeof record?.description === 'string' ? record.description.trim()
        : typeof record?.criterion === 'string' ? record.criterion.trim()
          : typeof record?.text === 'string' ? record.text.trim() : ''
    if (!description) throw new DungeonError('INVALID_ARGS', `acceptanceCriteria[${index}] needs a description`)
    return {
      id: typeof record?.id === 'string' && record.id.trim() ? record.id.trim() : `${id}:criterion-${index + 1}`,
      description,
      required: typeof record?.required === 'boolean' ? record.required : true,
    }
  })
  const priority = value.priority ?? 'normal'
  if (!['critical', 'high', 'normal', 'low'].includes(String(priority))) {
    throw new DungeonError('INVALID_ARGS', 'workOrder.priority must be critical, high, normal, or low')
  }
  return {
    id,
    runId,
    title,
    objective,
    inputs: stringList(value.inputs, 'workOrder.inputs'),
    constraints: stringList(value.constraints, 'workOrder.constraints'),
    acceptanceCriteria,
    readScopes: stringList(value.readScopes, 'workOrder.readScopes'),
    writeScopes: stringList(value.writeScopes, 'workOrder.writeScopes'),
    globalCommands: stringList(value.globalCommands, 'workOrder.globalCommands'),
    blockedBy: stringList(value.blockedBy, 'workOrder.blockedBy'),
    expectedArtifacts: stringList(value.expectedArtifacts, 'workOrder.expectedArtifacts'),
    priority: priority as WorkOrder['priority'],
    required: typeof value.required === 'boolean' ? value.required : true,
    version: 1,
  }
}

function normalizePartyMessage(value: Record<string, unknown>): PartyMessageInput {
  const kind = typeof value.kind === 'string' ? value.kind : 'notice'
  if (!['progress', 'blocked', 'risk', 'question', 'decision', 'notice'].includes(kind)) {
    throw new DungeonError('INVALID_ARGS', 'message.kind is invalid')
  }
  const evidence = stringList(value.evidence, 'message.evidence')
  const explicitSummary = typeof value.summary === 'string' ? value.summary.trim()
    : typeof value.text === 'string' ? value.text.trim() : ''
  const summary = explicitSummary || evidence[0] || `${kind} update`
  return { kind: kind as PartyMessageInput['kind'], summary, evidence }
}

function currentTurnId(exec: ToolRunContext): string | undefined {
  const turn = exec.agent
    ? [...exec.agent.session.events].reverse().find((event) => event.type === 'turn/start')
    : undefined
  if (!turn || turn.type !== 'turn/start') return undefined
  return `turn-${turn.data.turn}`
}

const output = {
  schema: { type: 'json' } as const,
  render: (_args: unknown, value: JsonValue) => [
    { type: 'text' as const, text: JSON.stringify(value, null, 2) },
  ],
}

export function registerDungeonTools(
  ctx: Context,
  service: DungeonService,
  agentManager?: PartyAgentManager,
): () => void {
  const disposers = [
    ctx.tools.register(defineTool({
      name: 'party_start',
      description: 'Create a dungeon-party run and bind the calling agent as tank.',
      parameters: {
        runId: { type: 'string' },
        objective: { type: 'string', required: true },
        workspaceRoot: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        const workspaceFingerprint = computeWorkspaceFingerprint(
          args.workspaceRoot,
          service.getFingerprintIgnoreScopes(),
        )
        return json(service.startRun({
          ...(args.runId ? { runId: args.runId } : {}),
          objective: args.objective,
          workspaceRoot: args.workspaceRoot,
          workspaceFingerprint,
          tankSessionId: caller.sessionId,
        }))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_status',
      description: 'Read the current dungeon-party run state as a current party member.',
      parameters: {
        runId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        service.getRunForActor(caller, args.runId)
        service.sweepExpiredState(args.runId)
        return json(service.getRunForActor(caller, args.runId))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_wait',
      description: 'Wait for durable run events newer than an event sequence cursor.',
      parameters: {
        runId: { type: 'string', required: true },
        afterSequence: { type: 'number', required: true },
        timeoutMs: { type: 'number' },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        service.getRunForActor(caller, args.runId)
        service.sweepExpiredState(args.runId)
        return json(await service.waitForChange(
          caller, args.runId, args.afterSequence, args.timeoutMs ?? 30_000, exec.signal,
        ))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_phase',
      description: 'As tank, move the run through FORMING→PLANNING (create all work orders)→EXECUTING (then assign DPS)→VALIDATING; entering execution activates the healer first.',
      parameters: {
        runId: { type: 'string', required: true },
        phase: {
          type: 'string',
          enum: ['FORMING', 'PLANNING', 'PLAN_REVIEW', 'EXECUTING', 'VALIDATING', 'REPAIR', 'FAILED', 'CANCELLED'],
          required: true,
        },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        const phase = args.phase as RunPhase
        if (phase === 'VALIDATING') {
          const run = service.changePhase(caller, args.runId, phase)
          await agentManager?.prepareForPhase(caller, args.runId, phase)
          return json(run)
        }
        await agentManager?.prepareForPhase(caller, args.runId, phase)
        return json(service.changePhase(caller, args.runId, phase))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_health',
      description: 'Read auditable readiness, progress, commander load, checkpoint, and recovery state.',
      parameters: {
        runId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        service.getRunForActor(caller, args.runId)
        service.sweepExpiredState(args.runId)
        const run = service.getRunForActor(caller, args.runId)
        return json({
          controlState: run.controlState,
          commanderLoad: run.commanderLoad,
          commanderCheckpoint: run.commanderCheckpoint,
          slots: run.slots,
          healthSignals: run.healthSignals,
          taskProgress: Object.fromEntries(Object.entries(run.tasks).map(([id, task]) => [id, {
            progressState: task.progressState,
            missedCheckpoints: task.missedCheckpoints,
            nextCheckpointDueAt: task.nextCheckpointDueAt,
          }])),
          battleResChargesRemaining: run.battleResChargesRemaining,
          commanderBattleResChargesRemaining: run.commanderBattleResChargesRemaining,
        })
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_assign',
      description: 'As tank, create a work order draft (runId/version/list defaults are host-normalized) or assign after party_phase enters EXECUTING/REPAIRING.',
      parameters: {
        runId: { type: 'string', required: true },
        action: { type: 'string', enum: ['create', 'assign'], required: true },
        workOrder: {
          type: 'object',
          additionalProperties: false,
          description: 'Work-order draft. The host generates id, runId, version, criterion ids, and omitted list defaults.',
          properties: {
            id: { type: 'string', description: 'Optional caller label; omit to use a host-generated task id.' },
            runId: { type: 'string', description: 'Deprecated and ignored; outer runId is authoritative.' },
            title: { type: 'string' },
            objective: { type: 'string' },
            inputs: { type: 'array', items: { type: 'string' } },
            constraints: { type: 'array', items: { type: 'string' } },
            acceptanceCriteria: {
              type: 'array',
              required: true,
              items: {
                oneOf: [
                  { type: 'string' },
                  {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      id: { type: 'string' },
                      description: { type: 'string', required: true },
                      required: { type: 'boolean' },
                    },
                  },
                ],
              },
            },
            readScopes: { type: 'array', items: { type: 'string' } },
            writeScopes: { type: 'array', items: { type: 'string' } },
            globalCommands: { type: 'array', items: { type: 'string' } },
            blockedBy: { type: 'array', items: { type: 'string' } },
            expectedArtifacts: { type: 'array', items: { type: 'string' } },
            priority: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
            required: { type: 'boolean' },
            version: { type: 'integer', description: 'Ignored for creation; host always starts at version 1.' },
          },
        },
        taskId: { type: 'string' },
        slot: { type: 'string', enum: ['dps-1', 'dps-2', 'dps-3'] },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        if (args.action === 'create') {
          if (!args.workOrder || typeof args.workOrder !== 'object' || Array.isArray(args.workOrder)) {
            throw new DungeonError('INVALID_ARGS', 'workOrder is required for create')
          }
          const run = service.getRunForActor(caller, args.runId)
          let ordinal = run.taskSetVersion + 1
          while (run.tasks[`task-${ordinal}`]) ordinal += 1
          return json(service.createTask(
            caller,
            args.runId,
            normalizeWorkOrderDraft(args.workOrder as Record<string, unknown>, args.runId, `task-${ordinal}`),
          ))
        }
        if (!args.taskId || !args.slot) throw new DungeonError('INVALID_ARGS', 'taskId and slot are required for assign')
        const run = service.getRunForActor(caller, args.runId)
        if (run.phase !== 'EXECUTING' && run.phase !== 'REPAIR') {
          return json({
            ok: false,
            code: 'INVALID_PHASE',
            message: `Assignment is not available during ${run.phase}. Finish creating work orders, then enter EXECUTING.`,
            currentPhase: run.phase,
            recommendedAction: { tool: 'party_phase', runId: args.runId, phase: 'EXECUTING' },
          })
        }
        service.preflightTaskAssignment(caller, args.runId, args.taskId, args.slot as DpsSlot)
        await agentManager?.ensureMember(caller, args.runId, args.slot as DpsSlot)
        const assigned = service.assignTask(caller, args.runId, args.taskId, args.slot as DpsSlot)
        agentManager?.dispatchTask(caller, args.runId, args.taskId)
        return json(assigned)
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_reopen',
      description: 'As tank, reopen a failed finding owner task for a versioned repair cycle.',
      parameters: {
        runId: { type: 'string', required: true },
        taskId: { type: 'string', required: true },
        findingIds: { type: 'array', items: { type: 'string' }, required: true },
      },
      output,
      async execute(args, exec) {
        return json(service.reopenTask(actor(exec), args.runId, args.taskId, args.findingIds))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_direct_recovery',
      description: 'As tank, issue validator-maintenance to a degraded but responsive healer.',
      parameters: {
        runId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        if (agentManager) {
          await agentManager.executeValidatorMaintenance(caller, args.runId)
          return json(service.getRunForActor(caller, args.runId).recoveryInstructions.at(-1))
        }
        return json(service.directValidatorMaintenance(caller, args.runId))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_request_checkpoint',
      description: 'As tank, request an immediate lease-bound checkpoint from a running DPS task.',
      parameters: {
        runId: { type: 'string', required: true },
        taskId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        if (agentManager) {
          agentManager.requestCheckpoint(caller, args.runId, args.taskId)
          return json(service.getRunForActor(caller, args.runId).checkpointRequests.at(-1))
        }
        return json(service.requestTaskCheckpoint(caller, args.runId, args.taskId))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_interrupt',
      description: 'As tank, request interruption of the exact active Turn for a confirmed stalled task.',
      parameters: {
        runId: { type: 'string', required: true },
        taskId: { type: 'string', required: true },
        turnId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        if (!agentManager) {
          return json(service.requestTaskInterrupt(caller, args.runId, args.taskId, args.turnId))
        }
        await agentManager.interruptTask(caller, args.runId, args.taskId, args.turnId)
        return json(service.getRunForActor(caller, args.runId).tasks[args.taskId])
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_review_quarantine',
      description: 'As tank, confirm review of workspace files quarantined after a Turn interruption.',
      parameters: {
        runId: { type: 'string', required: true },
        taskId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        return json(service.reviewQuarantinedChanges(actor(exec), args.runId, args.taskId))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_reassign',
      description: 'As tank, reassign a safely interrupted task after lease revocation and quarantine review.',
      parameters: {
        runId: { type: 'string', required: true },
        taskId: { type: 'string', required: true },
        slot: { type: 'string', enum: ['dps-1', 'dps-2', 'dps-3'], required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        const slot = args.slot as DpsSlot
        await agentManager?.ensureMember(caller, args.runId, slot)
        const task = service.reassignTask(caller, args.runId, args.taskId, slot)
        agentManager?.dispatchTask(caller, args.runId, args.taskId)
        return json(task)
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_resume_dispatch',
      description: 'As the recovered tank, resume dispatch after reviewing the commander checkpoint.',
      parameters: {
        runId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        return json(service.resumeDispatch(actor(exec), args.runId))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'request_battle_res',
      description: 'As tank, reserve battle resurrection only when party_health reports the DPS lifeState=down; use checkpoint/interrupt for an alive stalled DPS.',
      parameters: {
        runId: { type: 'string', required: true },
        slot: { type: 'string', enum: ['dps-1', 'dps-2', 'dps-3'], required: true },
        resurrectionId: { type: 'string' },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        const run = service.getRunForActor(caller, args.runId)
        const currentLifeState = run.slots[args.slot as DpsSlot].lifeState
        if (currentLifeState !== 'down') {
          return json({
            ok: false,
            code: 'MEMBER_NOT_DOWN',
            message: `Battle resurrection requires lifeState=down; ${args.slot} is currently ${currentLifeState}.`,
            currentLifeState,
            recommendedTools: ['party_request_checkpoint', 'party_interrupt'],
          })
        }
        const request = service.requestBattleRes(caller, args.runId, args.slot as DpsSlot, args.resurrectionId)
        agentManager?.dispatchBattleRes(caller, args.runId, request.resurrectionId)
        return json(request)
      },
    })),
    ctx.tools.register(defineTool({
      name: 'work_claim',
      description: 'Claim a task assigned to the calling DPS and receive its versioned lease.',
      parameters: {
        runId: { type: 'string', required: true },
        taskId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        const lease = service.claimTask(caller, args.runId, args.taskId)
        agentManager?.beginLeaseAudit(caller, args.runId, args.taskId, lease.leaseId)
        const turnId = currentTurnId(exec)
        if (turnId) service.registerTaskTurn(args.runId, args.taskId, turnId)
        return json(lease)
      },
    })),
    ctx.tools.register(defineTool({
      name: 'work_submit',
      description: 'Submit a structured execution report using the calling DPS current lease.',
      parameters: {
        runId: { type: 'string', required: true },
        report: { type: 'json', required: true },
      },
      output,
      async execute(args, exec) {
        const report = args.report as unknown as ExecutionReport
        const caller = actor(exec)
        const turnId = currentTurnId(exec)
        if (turnId) service.registerTaskTurn(args.runId, report.taskId, turnId)
        agentManager?.auditWorkspaceBeforeSubmit(caller, args.runId, report)
        const task = service.submitExecution(caller, args.runId, report)
        agentManager?.completeLeaseAudit(args.runId, report.taskId)
        return json(task)
      },
    })),
    ctx.tools.register(defineTool({
      name: 'member_checkpoint',
      description: 'As the owning DPS, submit a lease-bound progress checkpoint with evidence delta.',
      parameters: {
        runId: { type: 'string', required: true },
        checkpoint: { type: 'json', required: true },
      },
      output,
      async execute(args, exec) {
        const checkpoint = args.checkpoint as unknown as DpsCheckpoint
        const turnId = currentTurnId(exec)
        if (turnId) service.registerTaskTurn(args.runId, checkpoint.taskId, turnId)
        return json(service.submitCheckpoint(actor(exec), args.runId, checkpoint))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_message',
      description: 'Send an auditable structured message to a currently bound party slot.',
      parameters: {
        runId: { type: 'string', required: true },
        toSlot: { type: 'string', enum: ['tank', 'dps-1', 'dps-2', 'dps-3', 'healer'], required: true },
        message: {
          type: 'object',
          additionalProperties: false,
          required: true,
          properties: {
            kind: { type: 'string', enum: ['progress', 'blocked', 'risk', 'question', 'decision', 'notice'] },
            summary: { type: 'string', description: 'Concise auditable summary; falls back to text or first evidence entry.' },
            text: { type: 'string', description: 'Convenience alias for summary.' },
            evidence: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        const message = normalizePartyMessage(args.message as unknown as Record<string, unknown>)
        if (agentManager) {
          agentManager.sendPartyMessage(caller, args.runId, args.toSlot as PartySlot, message)
          return json(service.getRunForActor(caller, args.runId).messages.at(-1))
        }
        return json(service.sendPartyMessage(caller, args.runId, args.toSlot as PartySlot, message))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'member_self_maintain',
      description: 'As healer, complete a tank-directed validator-maintenance instruction in the same Session.',
      parameters: {
        runId: { type: 'string', required: true },
        instructionId: { type: 'string', required: true },
        success: { type: 'boolean', required: true },
      },
      output,
      async execute(args, exec) {
        return json(service.completeValidatorMaintenance(actor(exec), args.runId, args.instructionId, args.success))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'validation_manifest',
      description: 'As tank create, or as healer retrieve, the immutable manifest for the current workspace.',
      parameters: {
        runId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        const run = service.getRunForActor(caller, args.runId)
        const fingerprint = computeWorkspaceFingerprint(run.workspaceRoot, service.getFingerprintIgnoreScopes())
        return json(service.createValidationManifest(caller, args.runId, fingerprint))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'validation_submit',
      description: 'As the bound healer, submit a structured report for the current validation manifest.',
      parameters: {
        runId: { type: 'string', required: true },
        report: { type: 'json', required: true },
      },
      output,
      async execute(args, exec) {
        return json(service.submitValidation(actor(exec), args.runId, args.report as unknown as ValidationSubmission))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'battle_res',
      description: 'As healer, consume or settle an authorized DPS resurrection or emergency commander ticket.',
      parameters: {
        runId: { type: 'string', required: true },
        action: {
          type: 'string',
          enum: ['start-dps', 'complete-dps', 'consume-commander', 'complete-commander'],
          required: true,
        },
        resurrectionId: { type: 'string' },
        ticketId: { type: 'string' },
        mode: { type: 'string', enum: ['resume', 'replace'] },
        outcome: { type: 'json' },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        if (args.action === 'start-dps') {
          if (!args.resurrectionId) throw new DungeonError('INVALID_ARGS', 'resurrectionId is required')
          return json(service.startBattleRes(caller, args.runId, args.resurrectionId))
        }
        if (args.action === 'complete-dps') {
          if (!args.resurrectionId) throw new DungeonError('INVALID_ARGS', 'resurrectionId is required')
          const outcome = args.outcome as unknown as {
            success: boolean
            mode: 'resume' | 'replace'
            sessionId: string
          } | undefined
          const mode = args.mode as 'resume' | 'replace' | undefined ?? outcome?.mode
          if (agentManager) {
            if (!mode) throw new DungeonError('INVALID_ARGS', 'mode is required')
            await agentManager.completeDpsResurrection(caller, args.runId, args.resurrectionId, mode)
            return json(service.getRunForActor(caller, args.runId).resurrectionRequests.find(
              (request) => request.resurrectionId === args.resurrectionId,
            ))
          }
          if (!outcome) throw new DungeonError('INVALID_ARGS', 'outcome is required without an Agent manager')
          return json(service.completeBattleRes(caller, args.runId, args.resurrectionId, outcome))
        }
        if (args.action === 'consume-commander') {
          if (!args.ticketId) throw new DungeonError('INVALID_ARGS', 'ticketId is required')
          return json(service.consumeCommanderRescueTicket(caller, args.runId, args.ticketId))
        }
        if (!args.ticketId) throw new DungeonError('INVALID_ARGS', 'ticketId is required')
        if (agentManager) {
          await agentManager.recoverCommander(caller, args.runId, args.ticketId)
          return json(service.getRunForActor(caller, args.runId).commanderRescueTickets.find(
            (ticket) => ticket.ticketId === args.ticketId,
          ))
        }
        if (!args.outcome) throw new DungeonError('INVALID_ARGS', 'outcome is required without an Agent manager')
        return json(service.completeCommanderResurrection(caller, args.runId, args.ticketId, args.outcome as unknown as {
          success: boolean
          sessionId: string
        }))
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_finish',
      description: 'As tank, complete a run only when every service-layer validation gate passes.',
      parameters: {
        runId: { type: 'string', required: true },
        resultSummary: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const caller = actor(exec)
        const current = service.getRunForActor(caller, args.runId)
        const fingerprint = computeWorkspaceFingerprint(current.workspaceRoot, service.getFingerprintIgnoreScopes())
        const run = service.finishRun(caller, args.runId, args.resultSummary, fingerprint)
        await agentManager?.disposeRun(args.runId)
        return json(run)
      },
    })),
    ctx.tools.register(defineTool({
      name: 'party_cancel',
      description: 'As tank, cancel a non-terminal run and stop all owned party child Agents.',
      parameters: {
        runId: { type: 'string', required: true },
      },
      output,
      async execute(args, exec) {
        const run = service.changePhase(actor(exec), args.runId, 'CANCELLED')
        await agentManager?.disposeRun(args.runId)
        return json(run)
      },
    })),
  ]

  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}
