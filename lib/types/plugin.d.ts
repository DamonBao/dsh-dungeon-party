import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { DungeonService, type DungeonConfig, type DungeonEventStore, type DungeonRun } from './service/dungeon-service.js';
import { PartyAgentManager } from './adapters/party-agent-manager.js';
export interface DungeonPartyPluginConfig {
    dungeon?: Partial<DungeonConfig>;
    eventStore?: DungeonEventStore;
    /**
     * Explicit provider/model route for party child agents. The live model
     * selection of the commander session is context-scoped and not exposed on
     * the rc8 Agent API, so `{...tankAgent.options}` cannot capture a UI-side
     * model switch; configure childRoute to pin the whole party to one route.
     */
    childRoute?: {
        provider?: string;
        model?: string;
    };
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        dungeonParty: DungeonPartyService;
    }
}
declare module '@deepseek-ai/dsh-session-projection' {
    interface SessionProjectionStateMap {
        'dungeon-party': DungeonRun | null;
    }
    interface SessionProjectionMap {
        'dungeon-party': DungeonRun | null;
    }
}
export declare function applyDungeonProjection(state: DungeonRun | null, event: SessionEvent): DungeonRun | null;
export declare const name = "dungeon-party";
export declare const inject: string[];
export declare const Config: z<Schemastery.ObjectS<{
    childRoute: z<Schemastery.ObjectS<{
        provider: z<string, string>;
        model: z<string, string>;
    }>, Schemastery.ObjectT<{
        provider: z<string, string>;
        model: z<string, string>;
    }>>;
    dungeon: z<Schemastery.ObjectS<{
        scopeEnforcementMode: z<"auto" | "telemetry" | "aggregate" | "serial", "auto" | "telemetry" | "aggregate" | "serial">;
        strictPerAgentWriteScopes: z<boolean, boolean>;
        maxConcurrentDps: z<number, number>;
        maxRepairRounds: z<number, number>;
        maxExecutionRetries: z<number, number>;
        battleResCharges: z<number, number>;
        commanderBattleResCharges: z<number, number>;
        resurrectionTimeoutMs: z<number, number>;
        commanderRescueTicketTtlMs: z<number, number>;
        commanderResurrectionTimeoutMs: z<number, number>;
        maxGenerationsPerSlot: z<number, number>;
        chargeOnFailedResurrection: z<boolean, boolean>;
        progressCheckpointIntervalMs: z<number, number>;
        checkpointResponseTimeoutMs: z<number, number>;
        maxMissedCheckpoints: z<number, number>;
        taskLeaseDurationMs: z<number, number>;
        readinessEvaluationWindowMs: z<number, number>;
        readinessWarningSignalCount: z<number, number>;
        readinessCriticalSignalCount: z<number, number>;
        commanderMaxPendingDecisions: z<number, number>;
        commanderDecisionSlaMs: z<number, number>;
        healerVerificationCommands: z<string[], string[]>;
        healerVerificationTimeoutMs: z<number, number>;
        fingerprintIgnoreScopes: z<string[], string[]>;
        validationRequired: z<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        scopeEnforcementMode: z<"auto" | "telemetry" | "aggregate" | "serial", "auto" | "telemetry" | "aggregate" | "serial">;
        strictPerAgentWriteScopes: z<boolean, boolean>;
        maxConcurrentDps: z<number, number>;
        maxRepairRounds: z<number, number>;
        maxExecutionRetries: z<number, number>;
        battleResCharges: z<number, number>;
        commanderBattleResCharges: z<number, number>;
        resurrectionTimeoutMs: z<number, number>;
        commanderRescueTicketTtlMs: z<number, number>;
        commanderResurrectionTimeoutMs: z<number, number>;
        maxGenerationsPerSlot: z<number, number>;
        chargeOnFailedResurrection: z<boolean, boolean>;
        progressCheckpointIntervalMs: z<number, number>;
        checkpointResponseTimeoutMs: z<number, number>;
        maxMissedCheckpoints: z<number, number>;
        taskLeaseDurationMs: z<number, number>;
        readinessEvaluationWindowMs: z<number, number>;
        readinessWarningSignalCount: z<number, number>;
        readinessCriticalSignalCount: z<number, number>;
        commanderMaxPendingDecisions: z<number, number>;
        commanderDecisionSlaMs: z<number, number>;
        healerVerificationCommands: z<string[], string[]>;
        healerVerificationTimeoutMs: z<number, number>;
        fingerprintIgnoreScopes: z<string[], string[]>;
        validationRequired: z<boolean, boolean>;
    }>>;
}>, Schemastery.ObjectT<{
    childRoute: z<Schemastery.ObjectS<{
        provider: z<string, string>;
        model: z<string, string>;
    }>, Schemastery.ObjectT<{
        provider: z<string, string>;
        model: z<string, string>;
    }>>;
    dungeon: z<Schemastery.ObjectS<{
        scopeEnforcementMode: z<"auto" | "telemetry" | "aggregate" | "serial", "auto" | "telemetry" | "aggregate" | "serial">;
        strictPerAgentWriteScopes: z<boolean, boolean>;
        maxConcurrentDps: z<number, number>;
        maxRepairRounds: z<number, number>;
        maxExecutionRetries: z<number, number>;
        battleResCharges: z<number, number>;
        commanderBattleResCharges: z<number, number>;
        resurrectionTimeoutMs: z<number, number>;
        commanderRescueTicketTtlMs: z<number, number>;
        commanderResurrectionTimeoutMs: z<number, number>;
        maxGenerationsPerSlot: z<number, number>;
        chargeOnFailedResurrection: z<boolean, boolean>;
        progressCheckpointIntervalMs: z<number, number>;
        checkpointResponseTimeoutMs: z<number, number>;
        maxMissedCheckpoints: z<number, number>;
        taskLeaseDurationMs: z<number, number>;
        readinessEvaluationWindowMs: z<number, number>;
        readinessWarningSignalCount: z<number, number>;
        readinessCriticalSignalCount: z<number, number>;
        commanderMaxPendingDecisions: z<number, number>;
        commanderDecisionSlaMs: z<number, number>;
        healerVerificationCommands: z<string[], string[]>;
        healerVerificationTimeoutMs: z<number, number>;
        fingerprintIgnoreScopes: z<string[], string[]>;
        validationRequired: z<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        scopeEnforcementMode: z<"auto" | "telemetry" | "aggregate" | "serial", "auto" | "telemetry" | "aggregate" | "serial">;
        strictPerAgentWriteScopes: z<boolean, boolean>;
        maxConcurrentDps: z<number, number>;
        maxRepairRounds: z<number, number>;
        maxExecutionRetries: z<number, number>;
        battleResCharges: z<number, number>;
        commanderBattleResCharges: z<number, number>;
        resurrectionTimeoutMs: z<number, number>;
        commanderRescueTicketTtlMs: z<number, number>;
        commanderResurrectionTimeoutMs: z<number, number>;
        maxGenerationsPerSlot: z<number, number>;
        chargeOnFailedResurrection: z<boolean, boolean>;
        progressCheckpointIntervalMs: z<number, number>;
        checkpointResponseTimeoutMs: z<number, number>;
        maxMissedCheckpoints: z<number, number>;
        taskLeaseDurationMs: z<number, number>;
        readinessEvaluationWindowMs: z<number, number>;
        readinessWarningSignalCount: z<number, number>;
        readinessCriticalSignalCount: z<number, number>;
        commanderMaxPendingDecisions: z<number, number>;
        commanderDecisionSlaMs: z<number, number>;
        healerVerificationCommands: z<string[], string[]>;
        healerVerificationTimeoutMs: z<number, number>;
        fingerprintIgnoreScopes: z<string[], string[]>;
        validationRequired: z<boolean, boolean>;
    }>>;
}>>;
export declare class DungeonPartyService extends Service {
    static inject: string[];
    static Config: z<Schemastery.ObjectS<{
        childRoute: z<Schemastery.ObjectS<{
            provider: z<string, string>;
            model: z<string, string>;
        }>, Schemastery.ObjectT<{
            provider: z<string, string>;
            model: z<string, string>;
        }>>;
        dungeon: z<Schemastery.ObjectS<{
            scopeEnforcementMode: z<"auto" | "telemetry" | "aggregate" | "serial", "auto" | "telemetry" | "aggregate" | "serial">;
            strictPerAgentWriteScopes: z<boolean, boolean>;
            maxConcurrentDps: z<number, number>;
            maxRepairRounds: z<number, number>;
            maxExecutionRetries: z<number, number>;
            battleResCharges: z<number, number>;
            commanderBattleResCharges: z<number, number>;
            resurrectionTimeoutMs: z<number, number>;
            commanderRescueTicketTtlMs: z<number, number>;
            commanderResurrectionTimeoutMs: z<number, number>;
            maxGenerationsPerSlot: z<number, number>;
            chargeOnFailedResurrection: z<boolean, boolean>;
            progressCheckpointIntervalMs: z<number, number>;
            checkpointResponseTimeoutMs: z<number, number>;
            maxMissedCheckpoints: z<number, number>;
            taskLeaseDurationMs: z<number, number>;
            readinessEvaluationWindowMs: z<number, number>;
            readinessWarningSignalCount: z<number, number>;
            readinessCriticalSignalCount: z<number, number>;
            commanderMaxPendingDecisions: z<number, number>;
            commanderDecisionSlaMs: z<number, number>;
            healerVerificationCommands: z<string[], string[]>;
            healerVerificationTimeoutMs: z<number, number>;
            fingerprintIgnoreScopes: z<string[], string[]>;
            validationRequired: z<boolean, boolean>;
        }>, Schemastery.ObjectT<{
            scopeEnforcementMode: z<"auto" | "telemetry" | "aggregate" | "serial", "auto" | "telemetry" | "aggregate" | "serial">;
            strictPerAgentWriteScopes: z<boolean, boolean>;
            maxConcurrentDps: z<number, number>;
            maxRepairRounds: z<number, number>;
            maxExecutionRetries: z<number, number>;
            battleResCharges: z<number, number>;
            commanderBattleResCharges: z<number, number>;
            resurrectionTimeoutMs: z<number, number>;
            commanderRescueTicketTtlMs: z<number, number>;
            commanderResurrectionTimeoutMs: z<number, number>;
            maxGenerationsPerSlot: z<number, number>;
            chargeOnFailedResurrection: z<boolean, boolean>;
            progressCheckpointIntervalMs: z<number, number>;
            checkpointResponseTimeoutMs: z<number, number>;
            maxMissedCheckpoints: z<number, number>;
            taskLeaseDurationMs: z<number, number>;
            readinessEvaluationWindowMs: z<number, number>;
            readinessWarningSignalCount: z<number, number>;
            readinessCriticalSignalCount: z<number, number>;
            commanderMaxPendingDecisions: z<number, number>;
            commanderDecisionSlaMs: z<number, number>;
            healerVerificationCommands: z<string[], string[]>;
            healerVerificationTimeoutMs: z<number, number>;
            fingerprintIgnoreScopes: z<string[], string[]>;
            validationRequired: z<boolean, boolean>;
        }>>;
    }>, Schemastery.ObjectT<{
        childRoute: z<Schemastery.ObjectS<{
            provider: z<string, string>;
            model: z<string, string>;
        }>, Schemastery.ObjectT<{
            provider: z<string, string>;
            model: z<string, string>;
        }>>;
        dungeon: z<Schemastery.ObjectS<{
            scopeEnforcementMode: z<"auto" | "telemetry" | "aggregate" | "serial", "auto" | "telemetry" | "aggregate" | "serial">;
            strictPerAgentWriteScopes: z<boolean, boolean>;
            maxConcurrentDps: z<number, number>;
            maxRepairRounds: z<number, number>;
            maxExecutionRetries: z<number, number>;
            battleResCharges: z<number, number>;
            commanderBattleResCharges: z<number, number>;
            resurrectionTimeoutMs: z<number, number>;
            commanderRescueTicketTtlMs: z<number, number>;
            commanderResurrectionTimeoutMs: z<number, number>;
            maxGenerationsPerSlot: z<number, number>;
            chargeOnFailedResurrection: z<boolean, boolean>;
            progressCheckpointIntervalMs: z<number, number>;
            checkpointResponseTimeoutMs: z<number, number>;
            maxMissedCheckpoints: z<number, number>;
            taskLeaseDurationMs: z<number, number>;
            readinessEvaluationWindowMs: z<number, number>;
            readinessWarningSignalCount: z<number, number>;
            readinessCriticalSignalCount: z<number, number>;
            commanderMaxPendingDecisions: z<number, number>;
            commanderDecisionSlaMs: z<number, number>;
            healerVerificationCommands: z<string[], string[]>;
            healerVerificationTimeoutMs: z<number, number>;
            fingerprintIgnoreScopes: z<string[], string[]>;
            validationRequired: z<boolean, boolean>;
        }>, Schemastery.ObjectT<{
            scopeEnforcementMode: z<"auto" | "telemetry" | "aggregate" | "serial", "auto" | "telemetry" | "aggregate" | "serial">;
            strictPerAgentWriteScopes: z<boolean, boolean>;
            maxConcurrentDps: z<number, number>;
            maxRepairRounds: z<number, number>;
            maxExecutionRetries: z<number, number>;
            battleResCharges: z<number, number>;
            commanderBattleResCharges: z<number, number>;
            resurrectionTimeoutMs: z<number, number>;
            commanderRescueTicketTtlMs: z<number, number>;
            commanderResurrectionTimeoutMs: z<number, number>;
            maxGenerationsPerSlot: z<number, number>;
            chargeOnFailedResurrection: z<boolean, boolean>;
            progressCheckpointIntervalMs: z<number, number>;
            checkpointResponseTimeoutMs: z<number, number>;
            maxMissedCheckpoints: z<number, number>;
            taskLeaseDurationMs: z<number, number>;
            readinessEvaluationWindowMs: z<number, number>;
            readinessWarningSignalCount: z<number, number>;
            readinessCriticalSignalCount: z<number, number>;
            commanderMaxPendingDecisions: z<number, number>;
            commanderDecisionSlaMs: z<number, number>;
            healerVerificationCommands: z<string[], string[]>;
            healerVerificationTimeoutMs: z<number, number>;
            fingerprintIgnoreScopes: z<string[], string[]>;
            validationRequired: z<boolean, boolean>;
        }>>;
    }>>;
    readonly core: DungeonService;
    readonly agentManager: PartyAgentManager;
    constructor(ctx: Context, config?: DungeonPartyPluginConfig);
}
export default DungeonPartyService;
