const stringArray = { type: 'array', items: { type: 'string' } };
const partySlot = { type: 'string', enum: ['tank', 'dps-1', 'dps-2', 'dps-3', 'healer'] };
const dpsSlot = { type: 'string', enum: ['dps-1', 'dps-2', 'dps-3'] };
const runPhase = {
    type: 'string',
    enum: ['FORMING', 'PLANNING', 'PLAN_REVIEW', 'EXECUTING', 'VALIDATING', 'REPAIR', 'COMPLETED', 'FAILED', 'CANCELLED'],
};
const acceptanceCriterion = {
    type: 'object', additionalProperties: false,
    properties: {
        id: { type: 'string', required: true },
        description: { type: 'string', required: true },
        required: { type: 'boolean', required: true },
    },
};
const workOrder = {
    type: 'object', additionalProperties: false,
    properties: {
        id: { type: 'string', required: true },
        runId: { type: 'string', required: true },
        title: { type: 'string', required: true },
        objective: { type: 'string', required: true },
        inputs: { ...stringArray, required: true },
        constraints: { ...stringArray, required: true },
        acceptanceCriteria: { type: 'array', items: acceptanceCriterion, required: true },
        readScopes: { ...stringArray, required: true },
        writeScopes: { ...stringArray, required: true },
        globalCommands: stringArray,
        blockedBy: { ...stringArray, required: true },
        expectedArtifacts: { ...stringArray, required: true },
        priority: { type: 'string', enum: ['critical', 'high', 'normal', 'low'], required: true },
        required: { type: 'boolean', required: true },
        version: { type: 'integer', required: true },
    },
};
const taskLease = {
    type: 'object', additionalProperties: false,
    properties: {
        leaseId: { type: 'string', required: true },
        ownerSlot: { ...dpsSlot, required: true },
        grantedAt: { type: 'string', required: true },
        expiresAt: { type: 'string', required: true },
        version: { type: 'integer', required: true },
    },
};
const modifiedAssertion = {
    type: 'object', additionalProperties: false,
    properties: {
        file: { type: 'string', required: true },
        test: { type: 'string' },
        reason: { type: 'string', required: true },
    },
};
const commandRun = {
    type: 'object', additionalProperties: false,
    properties: {
        command: { type: 'string', required: true },
        exitCode: { type: 'number' },
        summary: { type: 'string', required: true },
    },
};
const executionReport = {
    type: 'object', additionalProperties: false,
    properties: {
        taskId: { type: 'string', required: true },
        taskVersion: { type: 'integer', required: true },
        leaseId: { type: 'string', required: true },
        leaseVersion: { type: 'integer', required: true },
        slot: { ...dpsSlot, required: true },
        generation: { type: 'integer', required: true },
        status: { type: 'string', enum: ['completed', 'blocked', 'failed'], required: true },
        summary: { type: 'string', required: true },
        changedFiles: { ...stringArray, required: true },
        modifiedAssertions: { type: 'array', items: modifiedAssertion },
        evidence: { ...stringArray, required: true },
        commandsRun: { type: 'array', items: commandRun, required: true },
        risks: { ...stringArray, required: true },
        remainingWork: { ...stringArray, required: true },
        workspaceFingerprint: { type: 'string' },
    },
};
const checkpoint = {
    type: 'object', additionalProperties: false,
    properties: {
        checkpointId: { type: 'string', required: true },
        taskId: { type: 'string', required: true },
        taskVersion: { type: 'integer', required: true },
        leaseId: { type: 'string', required: true },
        leaseVersion: { type: 'integer', required: true },
        slot: { ...dpsSlot, required: true },
        completed: { ...stringArray, required: true },
        nextSteps: { ...stringArray, required: true },
        evidenceDelta: { ...stringArray, required: true },
        blockers: { ...stringArray, required: true },
        workspaceFingerprint: { type: 'string', required: true },
        observedAt: { type: 'string' },
    },
};
export const taskRecordSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        workOrder: { ...workOrder, required: true },
        status: {
            type: 'string',
            enum: ['pending', 'ready', 'running', 'completed', 'blocked', 'failed', 'scope-violation'],
            required: true,
        },
        ownerSlot: dpsSlot,
        activeLease: taskLease,
        progressState: { type: 'string', enum: ['on-track', 'suspected-stalled', 'stalled'] },
        missedCheckpoints: { type: 'integer' },
        nextCheckpointDueAt: { type: 'string' },
        lastCheckpoint: checkpoint,
        currentTurnId: { type: 'string' },
        interruptState: { type: 'string', enum: ['requested', 'completed', 'failed'] },
        quarantinedFiles: stringArray,
        quarantineReviewed: { type: 'boolean' },
        repairRound: { type: 'integer', required: true },
        executionReports: { type: 'array', items: executionReport, required: true },
    },
};
const slotHistory = {
    type: 'object', additionalProperties: false,
    properties: {
        sessionId: { type: 'string', required: true },
        generation: { type: 'integer', required: true },
        boundAt: { type: 'string', required: true },
        unboundAt: { type: 'string' },
        endReason: { type: 'string' },
    },
};
const slotBinding = {
    type: 'object', additionalProperties: false,
    properties: {
        runId: { type: 'string', required: true },
        slot: { ...partySlot, required: true },
        currentSessionId: { type: 'string' },
        generation: { type: 'integer', required: true },
        lifeState: { type: 'string', enum: ['alive', 'down', 'resurrection-requested', 'resurrecting', 'permanently-dead'] },
        activityState: { type: 'string', enum: ['idle', 'queued', 'running', 'waiting', 'stopped'] },
        readiness: { type: 'string', enum: ['healthy', 'degraded', 'unavailable', 'recovering'] },
        history: { type: 'array', items: slotHistory, required: true },
    },
};
const slots = {
    type: 'object', additionalProperties: false,
    properties: {
        tank: { ...slotBinding, required: true },
        'dps-1': { ...slotBinding, required: true },
        'dps-2': { ...slotBinding, required: true },
        'dps-3': { ...slotBinding, required: true },
        healer: { ...slotBinding, required: true },
    },
};
const runTaskSummary = {
    type: 'object', additionalProperties: false,
    properties: {
        id: { type: 'string', required: true },
        title: { type: 'string', required: true },
        status: {
            type: 'string', enum: ['pending', 'ready', 'running', 'completed', 'blocked', 'failed', 'scope-violation'], required: true,
        },
        progressState: { type: 'string', enum: ['on-track', 'suspected-stalled', 'stalled'] },
        ownerSlot: dpsSlot,
        blockedBy: { ...stringArray, required: true },
        taskVersion: { type: 'integer', required: true },
        leaseVersion: { type: 'integer' },
        nextCheckpointDueAt: { type: 'string' },
        summary: { type: 'string' },
        modifiedAssertions: { type: 'array', items: modifiedAssertion },
    },
};
const latestMessage = {
    type: 'object', additionalProperties: false,
    properties: {
        messageId: { type: 'string', required: true },
        fromSlot: { ...partySlot, required: true },
        kind: { type: 'string', enum: ['progress', 'blocked', 'risk', 'question', 'decision', 'notice'], required: true },
        summary: { type: 'string' },
        createdAt: { type: 'string', required: true },
    },
};
const recentHealthSignal = {
    type: 'object', additionalProperties: false,
    properties: {
        id: { type: 'string', required: true },
        slot: { ...partySlot, required: true },
        kind: {
            type: 'string',
            enum: ['turn-error', 'timeout', 'context-pressure', 'budget-pressure', 'tool-failure', 'queue-pressure', 'progress-stall'],
            required: true,
        },
        severity: { type: 'string', enum: ['warning', 'critical'], required: true },
        observedAt: { type: 'string', required: true },
        evidence: stringArray,
    },
};
const verificationRunSummary = {
    type: 'object', additionalProperties: false,
    properties: {
        command: { type: 'string', required: true },
        exitCode: { type: 'number' },
        durationMs: { type: 'number', required: true },
        beganAt: { type: 'string', required: true },
        outputExcerpt: { type: 'string' },
    },
};
export const runSummarySchema = {
    type: 'object', additionalProperties: false,
    properties: {
        id: { type: 'string', required: true },
        phase: { ...runPhase, required: true },
        objective: { type: 'string' },
        workspaceFingerprint: { type: 'string', required: true },
        controlState: { type: 'string', enum: ['normal', 'throttled', 'paused', 'recovering'], required: true },
        commanderLoad: { type: 'string', enum: ['normal', 'pressured', 'overloaded', 'unavailable'], required: true },
        slots: { ...slots, required: true },
        tasks: { type: 'array', items: runTaskSummary, required: true },
        taskCount: { type: 'integer', required: true },
        omittedTaskCount: { type: 'integer', required: true },
        latestMessages: { type: 'array', items: latestMessage, required: true },
        recentHealthSignals: { type: 'array', items: recentHealthSignal, required: true },
        battleResChargesRemaining: { type: 'integer', required: true },
        commanderBattleResChargesRemaining: { type: 'integer', required: true },
        validationReportCount: { type: 'integer', required: true },
        verificationRuns: { type: 'array', items: verificationRunSummary, required: true },
        resultSummary: { type: 'string' },
        updatedAt: { type: 'string', required: true },
    },
};
const eventSummary = {
    type: 'object', additionalProperties: false,
    properties: {
        sequence: { type: 'integer', required: true },
        type: { type: 'string', required: true },
        occurredAt: { type: 'string', required: true },
        taskId: { type: 'string' },
        slot: { type: 'string' },
        phase: { type: 'string' },
        status: { type: 'string' },
        reason: { type: 'string' },
        ticketId: { type: 'string' },
        resurrectionId: { type: 'string' },
    },
};
export const waitSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        run: { ...runSummarySchema, required: true },
        events: { type: 'array', items: eventSummary, required: true },
        omittedEventCount: { type: 'integer', required: true },
        timedOut: { type: 'boolean', required: true },
    },
};
const commanderCheckpoint = {
    type: 'object', additionalProperties: false,
    properties: {
        checkpointId: { type: 'string', required: true },
        runId: { type: 'string', required: true },
        phase: { ...runPhase, required: true },
        controlState: { type: 'string', enum: ['normal', 'throttled', 'paused', 'recovering'], required: true },
        taskSetVersion: { type: 'integer', required: true },
        pendingDecisionIds: { ...stringArray, required: true },
        activeLeaseIds: { ...stringArray, required: true },
        memberReadiness: {
            type: 'object', additionalProperties: false,
            properties: {
                tank: { type: 'string', enum: ['healthy', 'degraded', 'unavailable', 'recovering'] },
                'dps-1': { type: 'string', enum: ['healthy', 'degraded', 'unavailable', 'recovering'] },
                'dps-2': { type: 'string', enum: ['healthy', 'degraded', 'unavailable', 'recovering'] },
                'dps-3': { type: 'string', enum: ['healthy', 'degraded', 'unavailable', 'recovering'] },
                healer: { type: 'string', enum: ['healthy', 'degraded', 'unavailable', 'recovering'] },
            },
            required: true,
        },
        workspaceFingerprint: { type: 'string', required: true },
        createdAt: { type: 'string', required: true },
    },
};
const healthTaskProgress = {
    type: 'object', additionalProperties: false,
    properties: {
        taskId: { type: 'string', required: true },
        progressState: { type: 'string', enum: ['on-track', 'suspected-stalled', 'stalled'] },
        missedCheckpoints: { type: 'integer' },
        nextCheckpointDueAt: { type: 'string' },
    },
};
export const healthSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        controlState: { type: 'string', enum: ['normal', 'throttled', 'paused', 'recovering'], required: true },
        commanderLoad: { type: 'string', enum: ['normal', 'pressured', 'overloaded', 'unavailable'], required: true },
        commanderCheckpoint,
        slots: { ...slots, required: true },
        healthSignals: { type: 'array', items: recentHealthSignal, required: true },
        taskProgress: { type: 'array', items: healthTaskProgress, required: true },
        battleResChargesRemaining: { type: 'integer', required: true },
        commanderBattleResChargesRemaining: { type: 'integer', required: true },
    },
};
const assignmentFailure = {
    type: 'object', additionalProperties: false,
    properties: {
        ok: { type: 'boolean', const: false, required: true },
        code: { type: 'string', const: 'INVALID_PHASE', required: true },
        message: { type: 'string', required: true },
        currentPhase: { ...runPhase, required: true },
        recommendedAction: {
            type: 'object', additionalProperties: false, required: true,
            properties: {
                tool: { type: 'string', const: 'party_phase', required: true },
                runId: { type: 'string', required: true },
                phase: { type: 'string', const: 'EXECUTING', required: true },
            },
        },
    },
};
export const assignmentSchema = { oneOf: [taskRecordSchema, assignmentFailure] };
export const recoveryInstructionSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        instructionId: { type: 'string', required: true },
        runId: { type: 'string', required: true },
        slot: { type: 'string', const: 'healer', required: true },
        action: { type: 'string', const: 'validator-maintenance', required: true },
        status: { type: 'string', enum: ['issued', 'completed', 'failed'], required: true },
        issuedAt: { type: 'string', required: true },
        expiresAt: { type: 'string', required: true },
        completedAt: { type: 'string' },
    },
};
export const checkpointRequestSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        requestId: { type: 'string', required: true },
        runId: { type: 'string', required: true },
        taskId: { type: 'string', required: true },
        taskVersion: { type: 'integer', required: true },
        leaseId: { type: 'string', required: true },
        leaseVersion: { type: 'integer', required: true },
        slot: { ...dpsSlot, required: true },
        status: { type: 'string', enum: ['issued', 'completed', 'expired'], required: true },
        issuedAt: { type: 'string', required: true },
        dueAt: { type: 'string', required: true },
        completedAt: { type: 'string' },
    },
};
const battleResFailure = {
    type: 'object', additionalProperties: false,
    properties: {
        ok: { type: 'boolean', const: false, required: true },
        code: { type: 'string', const: 'MEMBER_NOT_DOWN', required: true },
        message: { type: 'string', required: true },
        currentLifeState: { type: 'string', enum: ['alive', 'down', 'resurrection-requested', 'resurrecting', 'permanently-dead'] },
        recommendedTools: { ...stringArray, required: true },
    },
};
export const resurrectionRequestSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        resurrectionId: { type: 'string', required: true },
        runId: { type: 'string', required: true },
        targetSlot: { ...dpsSlot, required: true },
        targetSessionId: { type: 'string', required: true },
        status: { type: 'string', enum: ['issued', 'consumed', 'completed', 'failed'], required: true },
        requestedAt: { type: 'string', required: true },
        expiresAt: { type: 'string', required: true },
    },
};
export const battleResRequestSchema = { oneOf: [resurrectionRequestSchema, battleResFailure] };
export const partyMessageSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        messageId: { type: 'string', required: true },
        runId: { type: 'string', required: true },
        fromSlot: { ...partySlot, required: true },
        toSlot: { ...partySlot, required: true },
        kind: { type: 'string', enum: ['progress', 'blocked', 'risk', 'question', 'decision', 'notice'], required: true },
        summary: { type: 'string', required: true },
        evidence: { ...stringArray, required: true },
        createdAt: { type: 'string', required: true },
    },
};
export const validationManifestSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        runId: { type: 'string', required: true },
        manifestVersion: { type: 'integer', required: true },
        taskSetVersion: { type: 'integer', required: true },
        workspaceFingerprint: { type: 'string', required: true },
        criteria: {
            type: 'array', required: true,
            items: {
                type: 'object', additionalProperties: false,
                properties: {
                    criterionId: { type: 'string', required: true },
                    taskId: { type: 'string', required: true },
                    taskVersion: { type: 'integer', required: true },
                    description: { type: 'string', required: true },
                    required: { type: 'boolean', required: true },
                },
            },
        },
        fingerprintIgnoreScopes: { ...stringArray, required: true },
        createdAt: { type: 'string', required: true },
    },
};
const validationCheck = {
    type: 'object', additionalProperties: false,
    properties: {
        criterionId: { type: 'string', required: true },
        status: { type: 'string', enum: ['pass', 'fail', 'blocked', 'not-applicable'], required: true },
        evidence: { ...stringArray, required: true },
        notApplicableReason: { type: 'string' },
    },
};
const validationFinding = {
    type: 'object', additionalProperties: false,
    properties: {
        id: { type: 'string', required: true },
        severity: { type: 'string', enum: ['critical', 'major', 'minor'], required: true },
        ownerTaskId: { type: 'string' },
        title: { type: 'string', required: true },
        evidence: { type: 'string', required: true },
        remediation: { type: 'string', required: true },
    },
};
export const validationReportSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        runId: { type: 'string', required: true },
        validationId: { type: 'string', required: true },
        verdict: { type: 'string', enum: ['pass', 'fail', 'blocked'], required: true },
        status: { type: 'string', enum: ['current', 'stale'], required: true },
        taskSetVersion: { type: 'integer', required: true },
        manifestVersion: { type: 'integer', required: true },
        workspaceFingerprint: { type: 'string', required: true },
        checks: { type: 'array', items: validationCheck, required: true },
        findings: { type: 'array', items: validationFinding, required: true },
        summary: { type: 'string', required: true },
        createdAt: { type: 'string', required: true },
    },
};
export const commanderTicketSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        ticketId: { type: 'string', required: true },
        runId: { type: 'string', required: true },
        targetSlot: { type: 'string', const: 'tank', required: true },
        targetSessionId: { type: 'string', required: true },
        healerSessionId: { type: 'string', required: true },
        commanderCheckpointId: { type: 'string', required: true },
        status: { type: 'string', enum: ['issued', 'consumed', 'completed', 'failed', 'expired'], required: true },
        issuedAt: { type: 'string', required: true },
        expiresAt: { type: 'string', required: true },
        recoveryExpiresAt: { type: 'string' },
        version: { type: 'integer', required: true },
    },
};
export const battleResActionSchema = { oneOf: [resurrectionRequestSchema, commanderTicketSchema] };
const verificationCommand = {
    type: 'object', additionalProperties: false,
    properties: {
        command: { type: 'string', required: true },
        exitCode: { type: 'number' },
        durationMs: { type: 'number', required: true },
        outputExcerpt: { type: 'string', required: true },
        beganAt: { type: 'string', required: true },
    },
};
const verificationTimeout = {
    type: 'object', additionalProperties: false,
    properties: {
        code: { type: 'string', const: 'VERIFICATION_TIMEOUT', required: true },
        command: { type: 'string', required: true },
        durationMs: { type: 'number', required: true },
        outputExcerpt: { type: 'string', required: true },
    },
};
export const verificationSchema = { oneOf: [verificationCommand, verificationTimeout] };
function structuredOutput(schema) {
    return {
        schema,
        render: (_args, value) => [
            { type: 'text', text: JSON.stringify(value, null, 2) },
        ],
    };
}
export const runSummaryOutput = structuredOutput(runSummarySchema);
export const waitOutput = structuredOutput(waitSchema);
export const healthOutput = structuredOutput(healthSchema);
export const assignmentOutput = structuredOutput(assignmentSchema);
export const taskRecordOutput = structuredOutput(taskRecordSchema);
export const recoveryInstructionOutput = structuredOutput(recoveryInstructionSchema);
export const checkpointRequestOutput = structuredOutput(checkpointRequestSchema);
export const battleResRequestOutput = structuredOutput(battleResRequestSchema);
export const taskLeaseOutput = structuredOutput(taskLease);
export const verificationOutput = structuredOutput(verificationSchema);
export const partyMessageOutput = structuredOutput(partyMessageSchema);
export const validationManifestOutput = structuredOutput(validationManifestSchema);
export const validationReportOutput = structuredOutput(validationReportSchema);
export const battleResActionOutput = structuredOutput(battleResActionSchema);
