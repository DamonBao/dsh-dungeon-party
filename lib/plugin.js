import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { z as wireSchema } from 'zod';
import { DungeonService, } from './service/dungeon-service.js';
import { PartyAgentManager } from './adapters/party-agent-manager.js';
import { SessionDungeonEventStore } from './adapters/session-event-store.js';
import { registerDungeonTools } from './tools/register.js';
import { registerDungeonSessionEventTypes } from './session-event-compat.js';
registerDungeonSessionEventTypes();
export function applyDungeonProjection(state, event) {
    if (event.type !== 'dungeon/projection')
        return state;
    return structuredClone(event.data);
}
export const name = 'dungeon-party';
export const inject = ['tools', 'sessions', 'agents', 'agentPresets'];
const positiveInteger = () => z.number().step(1).min(1);
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
        fingerprintIgnoreScopes: z.array(z.string()).default([
            '.git/**', 'node_modules/**', 'lib/**', 'dist/**', 'coverage/**', '.dsh/dungeon-party/tmp/**',
        ]),
        validationRequired: z.boolean(),
    }),
});
export class DungeonPartyService extends Service {
    static inject = inject;
    static Config = Config;
    core;
    agentManager;
    constructor(ctx, config = {}) {
        super(ctx, 'dungeonParty');
        ctx.inject(['sessionProjections'], (projectionCtx) => {
            const schema = wireSchema.custom((value) => value === null || (typeof value === 'object' && value !== null && typeof value.id === 'string'));
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
            });
        });
        this.core = new DungeonService({
            eventStore: config.eventStore ?? new SessionDungeonEventStore(ctx.sessions),
            ...(config.dungeon ? { config: config.dungeon } : {}),
        });
        this.agentManager = new PartyAgentManager(this.core, ctx.agents, ctx.agentPresets, config.childRoute);
        const core = this.core;
        const manager = this.agentManager;
        const dispatchCommanderTickets = (runIds) => {
            for (const runId of new Set(runIds)) {
                const ticket = core.getRun(runId).commanderRescueTickets.find((item) => item.status === 'issued');
                if (ticket)
                    manager.dispatchCommanderRescue(runId, ticket.ticketId);
            }
        };
        ctx.on('session/event', (session, event) => {
            if (event.type !== 'turn/end')
                return;
            const reason = event.data.reason;
            const signals = core.observeAgentTurnEnd(String(session.id), reason.kind, [JSON.stringify(reason)]);
            dispatchCommanderTickets(signals.map((signal) => signal.runId));
            manager.nudgeAfterTurnEnd(String(session.id));
        });
        // Periodic watchdog: expires stale leases, escalates stalled tasks, and
        // keeps dispatch moving even when no tool call kicks the scheduler.
        const watchdogTimer = setInterval(() => {
            void manager.runWatchdog().catch(() => undefined);
        }, 30_000);
        watchdogTimer.unref?.();
        ctx.effect(() => () => clearInterval(watchdogTimer), 'dungeon-party watchdog');
        ctx.on('agent/disposed', ({ agent }) => {
            manager.forgetDisposedAgent(String(agent.id));
            const runs = core.observeAgentDisposed(String(agent.id), 'runtime Agent disposed');
            dispatchCommanderTickets(runs.map((run) => run.id));
        });
        ctx.effect(() => () => manager.dispose(), 'dungeon-party agents');
        ctx.effect(() => registerDungeonTools(ctx, this.core, manager), 'dungeon-party tools');
    }
}
export default DungeonPartyService;
