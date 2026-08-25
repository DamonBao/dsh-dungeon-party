export declare const taskRecordSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly workOrder: {
            readonly required: true;
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly runId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly title: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly objective: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly inputs: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly constraints: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly acceptanceCriteria: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly description: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly required: {
                                readonly type: "boolean";
                                readonly required: true;
                            };
                        };
                    };
                    readonly required: true;
                };
                readonly readScopes: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly writeScopes: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly globalCommands: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly blockedBy: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly expectedArtifacts: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly priority: {
                    readonly type: "string";
                    readonly enum: readonly ["critical", "high", "normal", "low"];
                    readonly required: true;
                };
                readonly required: {
                    readonly type: "boolean";
                    readonly required: true;
                };
                readonly version: {
                    readonly type: "integer";
                    readonly required: true;
                };
            };
        };
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["pending", "ready", "running", "completed", "blocked", "failed", "scope-violation"];
            readonly required: true;
        };
        readonly ownerSlot: {
            readonly type: "string";
            readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
        };
        readonly activeLease: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly leaseId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly ownerSlot: {
                    readonly required: true;
                    readonly type: "string";
                    readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                };
                readonly grantedAt: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly expiresAt: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly version: {
                    readonly type: "integer";
                    readonly required: true;
                };
            };
        };
        readonly progressState: {
            readonly type: "string";
            readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
        };
        readonly missedCheckpoints: {
            readonly type: "integer";
        };
        readonly nextCheckpointDueAt: {
            readonly type: "string";
        };
        readonly lastCheckpoint: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly checkpointId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly taskId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly taskVersion: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly leaseId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly leaseVersion: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly slot: {
                    readonly required: true;
                    readonly type: "string";
                    readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                };
                readonly completed: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly nextSteps: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly evidenceDelta: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly blockers: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly workspaceFingerprint: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly observedAt: {
                    readonly type: "string";
                };
            };
        };
        readonly currentTurnId: {
            readonly type: "string";
        };
        readonly interruptState: {
            readonly type: "string";
            readonly enum: readonly ["requested", "completed", "failed"];
        };
        readonly quarantinedFiles: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly quarantineReviewed: {
            readonly type: "boolean";
        };
        readonly repairRound: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly executionRetries: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly executionReports: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly taskId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly taskVersion: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly leaseId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly leaseVersion: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly slot: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                    };
                    readonly generation: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly status: {
                        readonly type: "string";
                        readonly enum: readonly ["completed", "blocked", "failed"];
                        readonly required: true;
                    };
                    readonly summary: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly changedFiles: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly modifiedAssertions: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly file: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly test: {
                                    readonly type: "string";
                                };
                                readonly reason: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                            };
                        };
                    };
                    readonly evidence: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly commandsRun: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly command: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly exitCode: {
                                    readonly type: "number";
                                };
                                readonly summary: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                            };
                        };
                        readonly required: true;
                    };
                    readonly risks: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly remainingWork: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly workspaceFingerprint: {
                        readonly type: "string";
                    };
                };
            };
            readonly required: true;
        };
    };
};
export declare const runSummarySchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly id: {
            readonly type: "string";
            readonly required: true;
        };
        readonly phase: {
            readonly required: true;
            readonly type: "string";
            readonly enum: readonly ["FORMING", "PLANNING", "PLAN_REVIEW", "EXECUTING", "VALIDATING", "REPAIR", "COMPLETED", "FAILED", "CANCELLED"];
        };
        readonly objective: {
            readonly type: "string";
        };
        readonly workspaceFingerprint: {
            readonly type: "string";
            readonly required: true;
        };
        readonly controlState: {
            readonly type: "string";
            readonly enum: readonly ["normal", "throttled", "paused", "recovering"];
            readonly required: true;
        };
        readonly commanderLoad: {
            readonly type: "string";
            readonly enum: readonly ["normal", "pressured", "overloaded", "unavailable"];
            readonly required: true;
        };
        readonly slots: {
            readonly required: true;
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly tank: {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
                readonly 'dps-1': {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
                readonly 'dps-2': {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
                readonly 'dps-3': {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
                readonly healer: {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
            };
        };
        readonly tasks: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly title: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly status: {
                        readonly type: "string";
                        readonly enum: readonly ["pending", "ready", "running", "completed", "blocked", "failed", "scope-violation"];
                        readonly required: true;
                    };
                    readonly progressState: {
                        readonly type: "string";
                        readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
                    };
                    readonly ownerSlot: {
                        readonly type: "string";
                        readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                    };
                    readonly blockedBy: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly taskVersion: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly leaseVersion: {
                        readonly type: "integer";
                    };
                    readonly nextCheckpointDueAt: {
                        readonly type: "string";
                    };
                    readonly summary: {
                        readonly type: "string";
                    };
                    readonly modifiedAssertions: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly file: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly test: {
                                    readonly type: "string";
                                };
                                readonly reason: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                            };
                        };
                    };
                };
            };
            readonly required: true;
        };
        readonly taskCount: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly omittedTaskCount: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly latestMessages: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly messageId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly fromSlot: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                    };
                    readonly kind: {
                        readonly type: "string";
                        readonly enum: readonly ["progress", "blocked", "risk", "question", "decision", "notice"];
                        readonly required: true;
                    };
                    readonly summary: {
                        readonly type: "string";
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                };
            };
            readonly required: true;
        };
        readonly recentHealthSignals: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly slot: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                    };
                    readonly kind: {
                        readonly type: "string";
                        readonly enum: readonly ["turn-error", "timeout", "context-pressure", "budget-pressure", "tool-failure", "queue-pressure", "progress-stall"];
                        readonly required: true;
                    };
                    readonly severity: {
                        readonly type: "string";
                        readonly enum: readonly ["warning", "critical"];
                        readonly required: true;
                    };
                    readonly observedAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly evidence: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                };
            };
            readonly required: true;
        };
        readonly battleResChargesRemaining: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly commanderBattleResChargesRemaining: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly validationReportCount: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly verificationRuns: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly command: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly exitCode: {
                        readonly type: "number";
                    };
                    readonly errorCode: {
                        readonly type: "string";
                    };
                    readonly errorMessage: {
                        readonly type: "string";
                    };
                    readonly durationMs: {
                        readonly type: "number";
                        readonly required: true;
                    };
                    readonly beganAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly outputExcerpt: {
                        readonly type: "string";
                    };
                };
            };
            readonly required: true;
        };
        readonly resultSummary: {
            readonly type: "string";
        };
        readonly updatedAt: {
            readonly type: "string";
            readonly required: true;
        };
    };
};
export declare const waitSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly run: {
            readonly required: true;
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly phase: {
                    readonly required: true;
                    readonly type: "string";
                    readonly enum: readonly ["FORMING", "PLANNING", "PLAN_REVIEW", "EXECUTING", "VALIDATING", "REPAIR", "COMPLETED", "FAILED", "CANCELLED"];
                };
                readonly objective: {
                    readonly type: "string";
                };
                readonly workspaceFingerprint: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly controlState: {
                    readonly type: "string";
                    readonly enum: readonly ["normal", "throttled", "paused", "recovering"];
                    readonly required: true;
                };
                readonly commanderLoad: {
                    readonly type: "string";
                    readonly enum: readonly ["normal", "pressured", "overloaded", "unavailable"];
                    readonly required: true;
                };
                readonly slots: {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly tank: {
                            readonly required: true;
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly runId: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly slot: {
                                    readonly required: true;
                                    readonly type: "string";
                                    readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                };
                                readonly currentSessionId: {
                                    readonly type: "string";
                                };
                                readonly generation: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly lifeState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                };
                                readonly activityState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                };
                                readonly readiness: {
                                    readonly type: "string";
                                    readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                };
                                readonly history: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "object";
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly sessionId: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly generation: {
                                                readonly type: "integer";
                                                readonly required: true;
                                            };
                                            readonly boundAt: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly unboundAt: {
                                                readonly type: "string";
                                            };
                                            readonly endReason: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly required: true;
                                };
                            };
                        };
                        readonly 'dps-1': {
                            readonly required: true;
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly runId: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly slot: {
                                    readonly required: true;
                                    readonly type: "string";
                                    readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                };
                                readonly currentSessionId: {
                                    readonly type: "string";
                                };
                                readonly generation: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly lifeState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                };
                                readonly activityState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                };
                                readonly readiness: {
                                    readonly type: "string";
                                    readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                };
                                readonly history: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "object";
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly sessionId: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly generation: {
                                                readonly type: "integer";
                                                readonly required: true;
                                            };
                                            readonly boundAt: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly unboundAt: {
                                                readonly type: "string";
                                            };
                                            readonly endReason: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly required: true;
                                };
                            };
                        };
                        readonly 'dps-2': {
                            readonly required: true;
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly runId: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly slot: {
                                    readonly required: true;
                                    readonly type: "string";
                                    readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                };
                                readonly currentSessionId: {
                                    readonly type: "string";
                                };
                                readonly generation: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly lifeState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                };
                                readonly activityState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                };
                                readonly readiness: {
                                    readonly type: "string";
                                    readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                };
                                readonly history: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "object";
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly sessionId: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly generation: {
                                                readonly type: "integer";
                                                readonly required: true;
                                            };
                                            readonly boundAt: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly unboundAt: {
                                                readonly type: "string";
                                            };
                                            readonly endReason: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly required: true;
                                };
                            };
                        };
                        readonly 'dps-3': {
                            readonly required: true;
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly runId: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly slot: {
                                    readonly required: true;
                                    readonly type: "string";
                                    readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                };
                                readonly currentSessionId: {
                                    readonly type: "string";
                                };
                                readonly generation: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly lifeState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                };
                                readonly activityState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                };
                                readonly readiness: {
                                    readonly type: "string";
                                    readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                };
                                readonly history: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "object";
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly sessionId: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly generation: {
                                                readonly type: "integer";
                                                readonly required: true;
                                            };
                                            readonly boundAt: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly unboundAt: {
                                                readonly type: "string";
                                            };
                                            readonly endReason: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly required: true;
                                };
                            };
                        };
                        readonly healer: {
                            readonly required: true;
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly runId: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly slot: {
                                    readonly required: true;
                                    readonly type: "string";
                                    readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                };
                                readonly currentSessionId: {
                                    readonly type: "string";
                                };
                                readonly generation: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly lifeState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                };
                                readonly activityState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                };
                                readonly readiness: {
                                    readonly type: "string";
                                    readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                };
                                readonly history: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "object";
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly sessionId: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly generation: {
                                                readonly type: "integer";
                                                readonly required: true;
                                            };
                                            readonly boundAt: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly unboundAt: {
                                                readonly type: "string";
                                            };
                                            readonly endReason: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly required: true;
                                };
                            };
                        };
                    };
                };
                readonly tasks: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly title: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly status: {
                                readonly type: "string";
                                readonly enum: readonly ["pending", "ready", "running", "completed", "blocked", "failed", "scope-violation"];
                                readonly required: true;
                            };
                            readonly progressState: {
                                readonly type: "string";
                                readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
                            };
                            readonly ownerSlot: {
                                readonly type: "string";
                                readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                            };
                            readonly blockedBy: {
                                readonly required: true;
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly taskVersion: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly leaseVersion: {
                                readonly type: "integer";
                            };
                            readonly nextCheckpointDueAt: {
                                readonly type: "string";
                            };
                            readonly summary: {
                                readonly type: "string";
                            };
                            readonly modifiedAssertions: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly file: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly test: {
                                            readonly type: "string";
                                        };
                                        readonly reason: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly required: true;
                };
                readonly taskCount: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly omittedTaskCount: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly latestMessages: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly messageId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly fromSlot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly kind: {
                                readonly type: "string";
                                readonly enum: readonly ["progress", "blocked", "risk", "question", "decision", "notice"];
                                readonly required: true;
                            };
                            readonly summary: {
                                readonly type: "string";
                            };
                            readonly createdAt: {
                                readonly type: "string";
                                readonly required: true;
                            };
                        };
                    };
                    readonly required: true;
                };
                readonly recentHealthSignals: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly kind: {
                                readonly type: "string";
                                readonly enum: readonly ["turn-error", "timeout", "context-pressure", "budget-pressure", "tool-failure", "queue-pressure", "progress-stall"];
                                readonly required: true;
                            };
                            readonly severity: {
                                readonly type: "string";
                                readonly enum: readonly ["warning", "critical"];
                                readonly required: true;
                            };
                            readonly observedAt: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly evidence: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                        };
                    };
                    readonly required: true;
                };
                readonly battleResChargesRemaining: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly commanderBattleResChargesRemaining: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly validationReportCount: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly verificationRuns: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly command: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly exitCode: {
                                readonly type: "number";
                            };
                            readonly errorCode: {
                                readonly type: "string";
                            };
                            readonly errorMessage: {
                                readonly type: "string";
                            };
                            readonly durationMs: {
                                readonly type: "number";
                                readonly required: true;
                            };
                            readonly beganAt: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly outputExcerpt: {
                                readonly type: "string";
                            };
                        };
                    };
                    readonly required: true;
                };
                readonly resultSummary: {
                    readonly type: "string";
                };
                readonly updatedAt: {
                    readonly type: "string";
                    readonly required: true;
                };
            };
        };
        readonly events: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly sequence: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly type: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly occurredAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly taskId: {
                        readonly type: "string";
                    };
                    readonly slot: {
                        readonly type: "string";
                    };
                    readonly phase: {
                        readonly type: "string";
                    };
                    readonly status: {
                        readonly type: "string";
                    };
                    readonly reason: {
                        readonly type: "string";
                    };
                    readonly ticketId: {
                        readonly type: "string";
                    };
                    readonly resurrectionId: {
                        readonly type: "string";
                    };
                };
            };
            readonly required: true;
        };
        readonly omittedEventCount: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly timedOut: {
            readonly type: "boolean";
            readonly required: true;
        };
    };
};
export declare const healthSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly controlState: {
            readonly type: "string";
            readonly enum: readonly ["normal", "throttled", "paused", "recovering"];
            readonly required: true;
        };
        readonly commanderLoad: {
            readonly type: "string";
            readonly enum: readonly ["normal", "pressured", "overloaded", "unavailable"];
            readonly required: true;
        };
        readonly commanderCheckpoint: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly checkpointId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly runId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly phase: {
                    readonly required: true;
                    readonly type: "string";
                    readonly enum: readonly ["FORMING", "PLANNING", "PLAN_REVIEW", "EXECUTING", "VALIDATING", "REPAIR", "COMPLETED", "FAILED", "CANCELLED"];
                };
                readonly controlState: {
                    readonly type: "string";
                    readonly enum: readonly ["normal", "throttled", "paused", "recovering"];
                    readonly required: true;
                };
                readonly taskSetVersion: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly pendingDecisionIds: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly activeLeaseIds: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly memberReadiness: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly tank: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly 'dps-1': {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly 'dps-2': {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly 'dps-3': {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly healer: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                    };
                    readonly required: true;
                };
                readonly workspaceFingerprint: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly createdAt: {
                    readonly type: "string";
                    readonly required: true;
                };
            };
        };
        readonly slots: {
            readonly required: true;
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly tank: {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
                readonly 'dps-1': {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
                readonly 'dps-2': {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
                readonly 'dps-3': {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
                readonly healer: {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly currentSessionId: {
                            readonly type: "string";
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly lifeState: {
                            readonly type: "string";
                            readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                        };
                        readonly activityState: {
                            readonly type: "string";
                            readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                        };
                        readonly readiness: {
                            readonly type: "string";
                            readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                        };
                        readonly history: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly sessionId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly boundAt: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly unboundAt: {
                                        readonly type: "string";
                                    };
                                    readonly endReason: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly required: true;
                        };
                    };
                };
            };
        };
        readonly healthSignals: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly slot: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                    };
                    readonly kind: {
                        readonly type: "string";
                        readonly enum: readonly ["turn-error", "timeout", "context-pressure", "budget-pressure", "tool-failure", "queue-pressure", "progress-stall"];
                        readonly required: true;
                    };
                    readonly severity: {
                        readonly type: "string";
                        readonly enum: readonly ["warning", "critical"];
                        readonly required: true;
                    };
                    readonly observedAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly evidence: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                };
            };
            readonly required: true;
        };
        readonly taskProgress: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly taskId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly progressState: {
                        readonly type: "string";
                        readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
                    };
                    readonly missedCheckpoints: {
                        readonly type: "integer";
                    };
                    readonly nextCheckpointDueAt: {
                        readonly type: "string";
                    };
                };
            };
            readonly required: true;
        };
        readonly battleResChargesRemaining: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly commanderBattleResChargesRemaining: {
            readonly type: "integer";
            readonly required: true;
        };
    };
};
export declare const assignmentSchema: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly workOrder: {
                readonly required: true;
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly runId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly title: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly objective: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly inputs: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly constraints: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly acceptanceCriteria: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly id: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly description: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly required: {
                                    readonly type: "boolean";
                                    readonly required: true;
                                };
                            };
                        };
                        readonly required: true;
                    };
                    readonly readScopes: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly writeScopes: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly globalCommands: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly blockedBy: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly expectedArtifacts: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly priority: {
                        readonly type: "string";
                        readonly enum: readonly ["critical", "high", "normal", "low"];
                        readonly required: true;
                    };
                    readonly required: {
                        readonly type: "boolean";
                        readonly required: true;
                    };
                    readonly version: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                };
            };
            readonly status: {
                readonly type: "string";
                readonly enum: readonly ["pending", "ready", "running", "completed", "blocked", "failed", "scope-violation"];
                readonly required: true;
            };
            readonly ownerSlot: {
                readonly type: "string";
                readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
            };
            readonly activeLease: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly leaseId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly ownerSlot: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                    };
                    readonly grantedAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly expiresAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly version: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                };
            };
            readonly progressState: {
                readonly type: "string";
                readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
            };
            readonly missedCheckpoints: {
                readonly type: "integer";
            };
            readonly nextCheckpointDueAt: {
                readonly type: "string";
            };
            readonly lastCheckpoint: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly checkpointId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly taskId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly taskVersion: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly leaseId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly leaseVersion: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly slot: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                    };
                    readonly completed: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly nextSteps: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly evidenceDelta: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly blockers: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly workspaceFingerprint: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly observedAt: {
                        readonly type: "string";
                    };
                };
            };
            readonly currentTurnId: {
                readonly type: "string";
            };
            readonly interruptState: {
                readonly type: "string";
                readonly enum: readonly ["requested", "completed", "failed"];
            };
            readonly quarantinedFiles: {
                readonly type: "array";
                readonly items: {
                    readonly type: "string";
                };
            };
            readonly quarantineReviewed: {
                readonly type: "boolean";
            };
            readonly repairRound: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly executionRetries: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly executionReports: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly taskId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly taskVersion: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly leaseId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly leaseVersion: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly status: {
                            readonly type: "string";
                            readonly enum: readonly ["completed", "blocked", "failed"];
                            readonly required: true;
                        };
                        readonly summary: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly changedFiles: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly modifiedAssertions: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly file: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly test: {
                                        readonly type: "string";
                                    };
                                    readonly reason: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                };
                            };
                        };
                        readonly evidence: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly commandsRun: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly command: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly exitCode: {
                                        readonly type: "number";
                                    };
                                    readonly summary: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                };
                            };
                            readonly required: true;
                        };
                        readonly risks: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly remainingWork: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly workspaceFingerprint: {
                            readonly type: "string";
                        };
                    };
                };
                readonly required: true;
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly ok: {
                readonly type: "boolean";
                readonly const: false;
                readonly required: true;
            };
            readonly code: {
                readonly type: "string";
                readonly const: "INVALID_PHASE";
                readonly required: true;
            };
            readonly message: {
                readonly type: "string";
                readonly required: true;
            };
            readonly currentPhase: {
                readonly required: true;
                readonly type: "string";
                readonly enum: readonly ["FORMING", "PLANNING", "PLAN_REVIEW", "EXECUTING", "VALIDATING", "REPAIR", "COMPLETED", "FAILED", "CANCELLED"];
            };
            readonly recommendedAction: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: true;
                readonly properties: {
                    readonly tool: {
                        readonly type: "string";
                        readonly const: "party_phase";
                        readonly required: true;
                    };
                    readonly runId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly phase: {
                        readonly type: "string";
                        readonly const: "EXECUTING";
                        readonly required: true;
                    };
                };
            };
        };
    }];
};
export declare const recoveryInstructionSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly instructionId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly runId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly slot: {
            readonly type: "string";
            readonly const: "healer";
            readonly required: true;
        };
        readonly action: {
            readonly type: "string";
            readonly const: "validator-maintenance";
            readonly required: true;
        };
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["issued", "completed", "failed"];
            readonly required: true;
        };
        readonly issuedAt: {
            readonly type: "string";
            readonly required: true;
        };
        readonly expiresAt: {
            readonly type: "string";
            readonly required: true;
        };
        readonly completedAt: {
            readonly type: "string";
        };
    };
};
export declare const checkpointRequestSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly requestId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly runId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly taskId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly taskVersion: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly leaseId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly leaseVersion: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly slot: {
            readonly required: true;
            readonly type: "string";
            readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
        };
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["issued", "completed", "expired"];
            readonly required: true;
        };
        readonly issuedAt: {
            readonly type: "string";
            readonly required: true;
        };
        readonly dueAt: {
            readonly type: "string";
            readonly required: true;
        };
        readonly completedAt: {
            readonly type: "string";
        };
    };
};
export declare const resurrectionRequestSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly resurrectionId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly runId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly targetSlot: {
            readonly required: true;
            readonly type: "string";
            readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
        };
        readonly targetSessionId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["issued", "consumed", "completed", "failed"];
            readonly required: true;
        };
        readonly requestedAt: {
            readonly type: "string";
            readonly required: true;
        };
        readonly expiresAt: {
            readonly type: "string";
            readonly required: true;
        };
    };
};
export declare const battleResRequestSchema: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly resurrectionId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly runId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly targetSlot: {
                readonly required: true;
                readonly type: "string";
                readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
            };
            readonly targetSessionId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly status: {
                readonly type: "string";
                readonly enum: readonly ["issued", "consumed", "completed", "failed"];
                readonly required: true;
            };
            readonly requestedAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly expiresAt: {
                readonly type: "string";
                readonly required: true;
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly ok: {
                readonly type: "boolean";
                readonly const: false;
                readonly required: true;
            };
            readonly code: {
                readonly type: "string";
                readonly const: "MEMBER_NOT_DOWN";
                readonly required: true;
            };
            readonly message: {
                readonly type: "string";
                readonly required: true;
            };
            readonly currentLifeState: {
                readonly type: "string";
                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
            };
            readonly recommendedTools: {
                readonly required: true;
                readonly type: "array";
                readonly items: {
                    readonly type: "string";
                };
            };
        };
    }];
};
export declare const partyMessageSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly messageId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly runId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly fromSlot: {
            readonly required: true;
            readonly type: "string";
            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
        };
        readonly toSlot: {
            readonly required: true;
            readonly type: "string";
            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
        };
        readonly kind: {
            readonly type: "string";
            readonly enum: readonly ["progress", "blocked", "risk", "question", "decision", "notice"];
            readonly required: true;
        };
        readonly summary: {
            readonly type: "string";
            readonly required: true;
        };
        readonly evidence: {
            readonly required: true;
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly createdAt: {
            readonly type: "string";
            readonly required: true;
        };
    };
};
export declare const validationManifestSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly runId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly manifestVersion: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly taskSetVersion: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly workspaceFingerprint: {
            readonly type: "string";
            readonly required: true;
        };
        readonly criteria: {
            readonly type: "array";
            readonly required: true;
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly criterionId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly taskId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly taskVersion: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly description: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly required: {
                        readonly type: "boolean";
                        readonly required: true;
                    };
                };
            };
        };
        readonly fingerprintIgnoreScopes: {
            readonly required: true;
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly createdAt: {
            readonly type: "string";
            readonly required: true;
        };
    };
};
export declare const validationReportSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly runId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly validationId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly verdict: {
            readonly type: "string";
            readonly enum: readonly ["pass", "fail", "blocked"];
            readonly required: true;
        };
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["current", "stale"];
            readonly required: true;
        };
        readonly taskSetVersion: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly manifestVersion: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly workspaceFingerprint: {
            readonly type: "string";
            readonly required: true;
        };
        readonly checks: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly criterionId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly status: {
                        readonly type: "string";
                        readonly enum: readonly ["pass", "fail", "blocked", "not-applicable"];
                        readonly required: true;
                    };
                    readonly evidence: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly notApplicableReason: {
                        readonly type: "string";
                    };
                };
            };
            readonly required: true;
        };
        readonly findings: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly severity: {
                        readonly type: "string";
                        readonly enum: readonly ["critical", "major", "minor"];
                        readonly required: true;
                    };
                    readonly ownerTaskId: {
                        readonly type: "string";
                    };
                    readonly title: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly evidence: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly remediation: {
                        readonly type: "string";
                        readonly required: true;
                    };
                };
            };
            readonly required: true;
        };
        readonly summary: {
            readonly type: "string";
            readonly required: true;
        };
        readonly createdAt: {
            readonly type: "string";
            readonly required: true;
        };
    };
};
export declare const commanderTicketSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly ticketId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly runId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly targetSlot: {
            readonly type: "string";
            readonly const: "tank";
            readonly required: true;
        };
        readonly targetSessionId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly healerSessionId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly commanderCheckpointId: {
            readonly type: "string";
            readonly required: true;
        };
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["issued", "consumed", "completed", "failed", "expired"];
            readonly required: true;
        };
        readonly issuedAt: {
            readonly type: "string";
            readonly required: true;
        };
        readonly expiresAt: {
            readonly type: "string";
            readonly required: true;
        };
        readonly recoveryExpiresAt: {
            readonly type: "string";
        };
        readonly version: {
            readonly type: "integer";
            readonly required: true;
        };
    };
};
export declare const battleResActionSchema: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly resurrectionId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly runId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly targetSlot: {
                readonly required: true;
                readonly type: "string";
                readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
            };
            readonly targetSessionId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly status: {
                readonly type: "string";
                readonly enum: readonly ["issued", "consumed", "completed", "failed"];
                readonly required: true;
            };
            readonly requestedAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly expiresAt: {
                readonly type: "string";
                readonly required: true;
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly ticketId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly runId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly targetSlot: {
                readonly type: "string";
                readonly const: "tank";
                readonly required: true;
            };
            readonly targetSessionId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly healerSessionId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly commanderCheckpointId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly status: {
                readonly type: "string";
                readonly enum: readonly ["issued", "consumed", "completed", "failed", "expired"];
                readonly required: true;
            };
            readonly issuedAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly expiresAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly recoveryExpiresAt: {
                readonly type: "string";
            };
            readonly version: {
                readonly type: "integer";
                readonly required: true;
            };
        };
    }];
};
export declare const verificationSchema: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly command: {
                readonly type: "string";
                readonly required: true;
            };
            readonly exitCode: {
                readonly type: "number";
            };
            readonly errorCode: {
                readonly type: "string";
            };
            readonly errorMessage: {
                readonly type: "string";
            };
            readonly durationMs: {
                readonly type: "number";
                readonly required: true;
            };
            readonly outputExcerpt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly beganAt: {
                readonly type: "string";
                readonly required: true;
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly code: {
                readonly type: "string";
                readonly const: "VERIFICATION_TIMEOUT";
                readonly required: true;
            };
            readonly command: {
                readonly type: "string";
                readonly required: true;
            };
            readonly durationMs: {
                readonly type: "number";
                readonly required: true;
            };
            readonly outputExcerpt: {
                readonly type: "string";
                readonly required: true;
            };
        };
    }];
};
export declare const runSummaryOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly id: {
                readonly type: "string";
                readonly required: true;
            };
            readonly phase: {
                readonly required: true;
                readonly type: "string";
                readonly enum: readonly ["FORMING", "PLANNING", "PLAN_REVIEW", "EXECUTING", "VALIDATING", "REPAIR", "COMPLETED", "FAILED", "CANCELLED"];
            };
            readonly objective: {
                readonly type: "string";
            };
            readonly workspaceFingerprint: {
                readonly type: "string";
                readonly required: true;
            };
            readonly controlState: {
                readonly type: "string";
                readonly enum: readonly ["normal", "throttled", "paused", "recovering"];
                readonly required: true;
            };
            readonly commanderLoad: {
                readonly type: "string";
                readonly enum: readonly ["normal", "pressured", "overloaded", "unavailable"];
                readonly required: true;
            };
            readonly slots: {
                readonly required: true;
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly tank: {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                    readonly 'dps-1': {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                    readonly 'dps-2': {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                    readonly 'dps-3': {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                    readonly healer: {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                };
            };
            readonly tasks: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly id: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly title: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly status: {
                            readonly type: "string";
                            readonly enum: readonly ["pending", "ready", "running", "completed", "blocked", "failed", "scope-violation"];
                            readonly required: true;
                        };
                        readonly progressState: {
                            readonly type: "string";
                            readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
                        };
                        readonly ownerSlot: {
                            readonly type: "string";
                            readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                        };
                        readonly blockedBy: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly taskVersion: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly leaseVersion: {
                            readonly type: "integer";
                        };
                        readonly nextCheckpointDueAt: {
                            readonly type: "string";
                        };
                        readonly summary: {
                            readonly type: "string";
                        };
                        readonly modifiedAssertions: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly file: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly test: {
                                        readonly type: "string";
                                    };
                                    readonly reason: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                };
                            };
                        };
                    };
                };
                readonly required: true;
            };
            readonly taskCount: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly omittedTaskCount: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly latestMessages: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly messageId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly fromSlot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly enum: readonly ["progress", "blocked", "risk", "question", "decision", "notice"];
                            readonly required: true;
                        };
                        readonly summary: {
                            readonly type: "string";
                        };
                        readonly createdAt: {
                            readonly type: "string";
                            readonly required: true;
                        };
                    };
                };
                readonly required: true;
            };
            readonly recentHealthSignals: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly id: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly enum: readonly ["turn-error", "timeout", "context-pressure", "budget-pressure", "tool-failure", "queue-pressure", "progress-stall"];
                            readonly required: true;
                        };
                        readonly severity: {
                            readonly type: "string";
                            readonly enum: readonly ["warning", "critical"];
                            readonly required: true;
                        };
                        readonly observedAt: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly evidence: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                    };
                };
                readonly required: true;
            };
            readonly battleResChargesRemaining: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly commanderBattleResChargesRemaining: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly validationReportCount: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly verificationRuns: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly command: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly exitCode: {
                            readonly type: "number";
                        };
                        readonly errorCode: {
                            readonly type: "string";
                        };
                        readonly errorMessage: {
                            readonly type: "string";
                        };
                        readonly durationMs: {
                            readonly type: "number";
                            readonly required: true;
                        };
                        readonly beganAt: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly outputExcerpt: {
                            readonly type: "string";
                        };
                    };
                };
                readonly required: true;
            };
            readonly resultSummary: {
                readonly type: "string";
            };
            readonly updatedAt: {
                readonly type: "string";
                readonly required: true;
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const waitOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly run: {
                readonly required: true;
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly phase: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["FORMING", "PLANNING", "PLAN_REVIEW", "EXECUTING", "VALIDATING", "REPAIR", "COMPLETED", "FAILED", "CANCELLED"];
                    };
                    readonly objective: {
                        readonly type: "string";
                    };
                    readonly workspaceFingerprint: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly controlState: {
                        readonly type: "string";
                        readonly enum: readonly ["normal", "throttled", "paused", "recovering"];
                        readonly required: true;
                    };
                    readonly commanderLoad: {
                        readonly type: "string";
                        readonly enum: readonly ["normal", "pressured", "overloaded", "unavailable"];
                        readonly required: true;
                    };
                    readonly slots: {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly tank: {
                                readonly required: true;
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly runId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly slot: {
                                        readonly required: true;
                                        readonly type: "string";
                                        readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                    };
                                    readonly currentSessionId: {
                                        readonly type: "string";
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly lifeState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                    };
                                    readonly activityState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                    };
                                    readonly readiness: {
                                        readonly type: "string";
                                        readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                    };
                                    readonly history: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "object";
                                            readonly additionalProperties: false;
                                            readonly properties: {
                                                readonly sessionId: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly generation: {
                                                    readonly type: "integer";
                                                    readonly required: true;
                                                };
                                                readonly boundAt: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly unboundAt: {
                                                    readonly type: "string";
                                                };
                                                readonly endReason: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                        readonly required: true;
                                    };
                                };
                            };
                            readonly 'dps-1': {
                                readonly required: true;
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly runId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly slot: {
                                        readonly required: true;
                                        readonly type: "string";
                                        readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                    };
                                    readonly currentSessionId: {
                                        readonly type: "string";
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly lifeState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                    };
                                    readonly activityState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                    };
                                    readonly readiness: {
                                        readonly type: "string";
                                        readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                    };
                                    readonly history: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "object";
                                            readonly additionalProperties: false;
                                            readonly properties: {
                                                readonly sessionId: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly generation: {
                                                    readonly type: "integer";
                                                    readonly required: true;
                                                };
                                                readonly boundAt: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly unboundAt: {
                                                    readonly type: "string";
                                                };
                                                readonly endReason: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                        readonly required: true;
                                    };
                                };
                            };
                            readonly 'dps-2': {
                                readonly required: true;
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly runId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly slot: {
                                        readonly required: true;
                                        readonly type: "string";
                                        readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                    };
                                    readonly currentSessionId: {
                                        readonly type: "string";
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly lifeState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                    };
                                    readonly activityState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                    };
                                    readonly readiness: {
                                        readonly type: "string";
                                        readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                    };
                                    readonly history: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "object";
                                            readonly additionalProperties: false;
                                            readonly properties: {
                                                readonly sessionId: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly generation: {
                                                    readonly type: "integer";
                                                    readonly required: true;
                                                };
                                                readonly boundAt: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly unboundAt: {
                                                    readonly type: "string";
                                                };
                                                readonly endReason: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                        readonly required: true;
                                    };
                                };
                            };
                            readonly 'dps-3': {
                                readonly required: true;
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly runId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly slot: {
                                        readonly required: true;
                                        readonly type: "string";
                                        readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                    };
                                    readonly currentSessionId: {
                                        readonly type: "string";
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly lifeState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                    };
                                    readonly activityState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                    };
                                    readonly readiness: {
                                        readonly type: "string";
                                        readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                    };
                                    readonly history: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "object";
                                            readonly additionalProperties: false;
                                            readonly properties: {
                                                readonly sessionId: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly generation: {
                                                    readonly type: "integer";
                                                    readonly required: true;
                                                };
                                                readonly boundAt: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly unboundAt: {
                                                    readonly type: "string";
                                                };
                                                readonly endReason: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                        readonly required: true;
                                    };
                                };
                            };
                            readonly healer: {
                                readonly required: true;
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly runId: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly slot: {
                                        readonly required: true;
                                        readonly type: "string";
                                        readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                    };
                                    readonly currentSessionId: {
                                        readonly type: "string";
                                    };
                                    readonly generation: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly lifeState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                                    };
                                    readonly activityState: {
                                        readonly type: "string";
                                        readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                                    };
                                    readonly readiness: {
                                        readonly type: "string";
                                        readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                                    };
                                    readonly history: {
                                        readonly type: "array";
                                        readonly items: {
                                            readonly type: "object";
                                            readonly additionalProperties: false;
                                            readonly properties: {
                                                readonly sessionId: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly generation: {
                                                    readonly type: "integer";
                                                    readonly required: true;
                                                };
                                                readonly boundAt: {
                                                    readonly type: "string";
                                                    readonly required: true;
                                                };
                                                readonly unboundAt: {
                                                    readonly type: "string";
                                                };
                                                readonly endReason: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                        readonly required: true;
                                    };
                                };
                            };
                        };
                    };
                    readonly tasks: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly id: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly title: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly status: {
                                    readonly type: "string";
                                    readonly enum: readonly ["pending", "ready", "running", "completed", "blocked", "failed", "scope-violation"];
                                    readonly required: true;
                                };
                                readonly progressState: {
                                    readonly type: "string";
                                    readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
                                };
                                readonly ownerSlot: {
                                    readonly type: "string";
                                    readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                                };
                                readonly blockedBy: {
                                    readonly required: true;
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "string";
                                    };
                                };
                                readonly taskVersion: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly leaseVersion: {
                                    readonly type: "integer";
                                };
                                readonly nextCheckpointDueAt: {
                                    readonly type: "string";
                                };
                                readonly summary: {
                                    readonly type: "string";
                                };
                                readonly modifiedAssertions: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "object";
                                        readonly additionalProperties: false;
                                        readonly properties: {
                                            readonly file: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                            readonly test: {
                                                readonly type: "string";
                                            };
                                            readonly reason: {
                                                readonly type: "string";
                                                readonly required: true;
                                            };
                                        };
                                    };
                                };
                            };
                        };
                        readonly required: true;
                    };
                    readonly taskCount: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly omittedTaskCount: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly latestMessages: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly messageId: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly fromSlot: {
                                    readonly required: true;
                                    readonly type: "string";
                                    readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                };
                                readonly kind: {
                                    readonly type: "string";
                                    readonly enum: readonly ["progress", "blocked", "risk", "question", "decision", "notice"];
                                    readonly required: true;
                                };
                                readonly summary: {
                                    readonly type: "string";
                                };
                                readonly createdAt: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                            };
                        };
                        readonly required: true;
                    };
                    readonly recentHealthSignals: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly id: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly slot: {
                                    readonly required: true;
                                    readonly type: "string";
                                    readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                                };
                                readonly kind: {
                                    readonly type: "string";
                                    readonly enum: readonly ["turn-error", "timeout", "context-pressure", "budget-pressure", "tool-failure", "queue-pressure", "progress-stall"];
                                    readonly required: true;
                                };
                                readonly severity: {
                                    readonly type: "string";
                                    readonly enum: readonly ["warning", "critical"];
                                    readonly required: true;
                                };
                                readonly observedAt: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly evidence: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                        readonly required: true;
                    };
                    readonly battleResChargesRemaining: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly commanderBattleResChargesRemaining: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly validationReportCount: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly verificationRuns: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly command: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly exitCode: {
                                    readonly type: "number";
                                };
                                readonly errorCode: {
                                    readonly type: "string";
                                };
                                readonly errorMessage: {
                                    readonly type: "string";
                                };
                                readonly durationMs: {
                                    readonly type: "number";
                                    readonly required: true;
                                };
                                readonly beganAt: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly outputExcerpt: {
                                    readonly type: "string";
                                };
                            };
                        };
                        readonly required: true;
                    };
                    readonly resultSummary: {
                        readonly type: "string";
                    };
                    readonly updatedAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                };
            };
            readonly events: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly sequence: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly type: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly occurredAt: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly taskId: {
                            readonly type: "string";
                        };
                        readonly slot: {
                            readonly type: "string";
                        };
                        readonly phase: {
                            readonly type: "string";
                        };
                        readonly status: {
                            readonly type: "string";
                        };
                        readonly reason: {
                            readonly type: "string";
                        };
                        readonly ticketId: {
                            readonly type: "string";
                        };
                        readonly resurrectionId: {
                            readonly type: "string";
                        };
                    };
                };
                readonly required: true;
            };
            readonly omittedEventCount: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly timedOut: {
                readonly type: "boolean";
                readonly required: true;
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const healthOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly controlState: {
                readonly type: "string";
                readonly enum: readonly ["normal", "throttled", "paused", "recovering"];
                readonly required: true;
            };
            readonly commanderLoad: {
                readonly type: "string";
                readonly enum: readonly ["normal", "pressured", "overloaded", "unavailable"];
                readonly required: true;
            };
            readonly commanderCheckpoint: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly checkpointId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly runId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly phase: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["FORMING", "PLANNING", "PLAN_REVIEW", "EXECUTING", "VALIDATING", "REPAIR", "COMPLETED", "FAILED", "CANCELLED"];
                    };
                    readonly controlState: {
                        readonly type: "string";
                        readonly enum: readonly ["normal", "throttled", "paused", "recovering"];
                        readonly required: true;
                    };
                    readonly taskSetVersion: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly pendingDecisionIds: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly activeLeaseIds: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly memberReadiness: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly tank: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly 'dps-1': {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly 'dps-2': {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly 'dps-3': {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly healer: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                        };
                        readonly required: true;
                    };
                    readonly workspaceFingerprint: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                };
            };
            readonly slots: {
                readonly required: true;
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly tank: {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                    readonly 'dps-1': {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                    readonly 'dps-2': {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                    readonly 'dps-3': {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                    readonly healer: {
                        readonly required: true;
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly runId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                            };
                            readonly currentSessionId: {
                                readonly type: "string";
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly lifeState: {
                                readonly type: "string";
                                readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                            };
                            readonly activityState: {
                                readonly type: "string";
                                readonly enum: readonly ["idle", "queued", "running", "waiting", "stopped"];
                            };
                            readonly readiness: {
                                readonly type: "string";
                                readonly enum: readonly ["healthy", "degraded", "unavailable", "recovering"];
                            };
                            readonly history: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly sessionId: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly generation: {
                                            readonly type: "integer";
                                            readonly required: true;
                                        };
                                        readonly boundAt: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly unboundAt: {
                                            readonly type: "string";
                                        };
                                        readonly endReason: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                        };
                    };
                };
            };
            readonly healthSignals: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly id: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
                        };
                        readonly kind: {
                            readonly type: "string";
                            readonly enum: readonly ["turn-error", "timeout", "context-pressure", "budget-pressure", "tool-failure", "queue-pressure", "progress-stall"];
                            readonly required: true;
                        };
                        readonly severity: {
                            readonly type: "string";
                            readonly enum: readonly ["warning", "critical"];
                            readonly required: true;
                        };
                        readonly observedAt: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly evidence: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                    };
                };
                readonly required: true;
            };
            readonly taskProgress: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly taskId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly progressState: {
                            readonly type: "string";
                            readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
                        };
                        readonly missedCheckpoints: {
                            readonly type: "integer";
                        };
                        readonly nextCheckpointDueAt: {
                            readonly type: "string";
                        };
                    };
                };
                readonly required: true;
            };
            readonly battleResChargesRemaining: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly commanderBattleResChargesRemaining: {
                readonly type: "integer";
                readonly required: true;
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const assignmentOutput: {
    schema: {
        readonly oneOf: readonly [{
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly workOrder: {
                    readonly required: true;
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly id: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly title: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly objective: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly inputs: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly constraints: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly acceptanceCriteria: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly id: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly description: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly required: {
                                        readonly type: "boolean";
                                        readonly required: true;
                                    };
                                };
                            };
                            readonly required: true;
                        };
                        readonly readScopes: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly writeScopes: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly globalCommands: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly blockedBy: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly expectedArtifacts: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly priority: {
                            readonly type: "string";
                            readonly enum: readonly ["critical", "high", "normal", "low"];
                            readonly required: true;
                        };
                        readonly required: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                        readonly version: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                    };
                };
                readonly status: {
                    readonly type: "string";
                    readonly enum: readonly ["pending", "ready", "running", "completed", "blocked", "failed", "scope-violation"];
                    readonly required: true;
                };
                readonly ownerSlot: {
                    readonly type: "string";
                    readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                };
                readonly activeLease: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly leaseId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly ownerSlot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                        };
                        readonly grantedAt: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly expiresAt: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly version: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                    };
                };
                readonly progressState: {
                    readonly type: "string";
                    readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
                };
                readonly missedCheckpoints: {
                    readonly type: "integer";
                };
                readonly nextCheckpointDueAt: {
                    readonly type: "string";
                };
                readonly lastCheckpoint: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly checkpointId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly taskId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly taskVersion: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly leaseId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly leaseVersion: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                        };
                        readonly completed: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly nextSteps: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly evidenceDelta: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly blockers: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly workspaceFingerprint: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly observedAt: {
                            readonly type: "string";
                        };
                    };
                };
                readonly currentTurnId: {
                    readonly type: "string";
                };
                readonly interruptState: {
                    readonly type: "string";
                    readonly enum: readonly ["requested", "completed", "failed"];
                };
                readonly quarantinedFiles: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly quarantineReviewed: {
                    readonly type: "boolean";
                };
                readonly repairRound: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly executionRetries: {
                    readonly type: "integer";
                    readonly required: true;
                };
                readonly executionReports: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly taskId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly taskVersion: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly leaseId: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly leaseVersion: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly slot: {
                                readonly required: true;
                                readonly type: "string";
                                readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                            };
                            readonly generation: {
                                readonly type: "integer";
                                readonly required: true;
                            };
                            readonly status: {
                                readonly type: "string";
                                readonly enum: readonly ["completed", "blocked", "failed"];
                                readonly required: true;
                            };
                            readonly summary: {
                                readonly type: "string";
                                readonly required: true;
                            };
                            readonly changedFiles: {
                                readonly required: true;
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly modifiedAssertions: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly file: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly test: {
                                            readonly type: "string";
                                        };
                                        readonly reason: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                    };
                                };
                            };
                            readonly evidence: {
                                readonly required: true;
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly commandsRun: {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly properties: {
                                        readonly command: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                        readonly exitCode: {
                                            readonly type: "number";
                                        };
                                        readonly summary: {
                                            readonly type: "string";
                                            readonly required: true;
                                        };
                                    };
                                };
                                readonly required: true;
                            };
                            readonly risks: {
                                readonly required: true;
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly remainingWork: {
                                readonly required: true;
                                readonly type: "array";
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly workspaceFingerprint: {
                                readonly type: "string";
                            };
                        };
                    };
                    readonly required: true;
                };
            };
        }, {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly ok: {
                    readonly type: "boolean";
                    readonly const: false;
                    readonly required: true;
                };
                readonly code: {
                    readonly type: "string";
                    readonly const: "INVALID_PHASE";
                    readonly required: true;
                };
                readonly message: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly currentPhase: {
                    readonly required: true;
                    readonly type: "string";
                    readonly enum: readonly ["FORMING", "PLANNING", "PLAN_REVIEW", "EXECUTING", "VALIDATING", "REPAIR", "COMPLETED", "FAILED", "CANCELLED"];
                };
                readonly recommendedAction: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: true;
                    readonly properties: {
                        readonly tool: {
                            readonly type: "string";
                            readonly const: "party_phase";
                            readonly required: true;
                        };
                        readonly runId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly phase: {
                            readonly type: "string";
                            readonly const: "EXECUTING";
                            readonly required: true;
                        };
                    };
                };
            };
        }];
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const taskRecordOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly workOrder: {
                readonly required: true;
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly runId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly title: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly objective: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly inputs: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly constraints: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly acceptanceCriteria: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly id: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly description: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly required: {
                                    readonly type: "boolean";
                                    readonly required: true;
                                };
                            };
                        };
                        readonly required: true;
                    };
                    readonly readScopes: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly writeScopes: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly globalCommands: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly blockedBy: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly expectedArtifacts: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly priority: {
                        readonly type: "string";
                        readonly enum: readonly ["critical", "high", "normal", "low"];
                        readonly required: true;
                    };
                    readonly required: {
                        readonly type: "boolean";
                        readonly required: true;
                    };
                    readonly version: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                };
            };
            readonly status: {
                readonly type: "string";
                readonly enum: readonly ["pending", "ready", "running", "completed", "blocked", "failed", "scope-violation"];
                readonly required: true;
            };
            readonly ownerSlot: {
                readonly type: "string";
                readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
            };
            readonly activeLease: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly leaseId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly ownerSlot: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                    };
                    readonly grantedAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly expiresAt: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly version: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                };
            };
            readonly progressState: {
                readonly type: "string";
                readonly enum: readonly ["on-track", "suspected-stalled", "stalled"];
            };
            readonly missedCheckpoints: {
                readonly type: "integer";
            };
            readonly nextCheckpointDueAt: {
                readonly type: "string";
            };
            readonly lastCheckpoint: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly checkpointId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly taskId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly taskVersion: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly leaseId: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly leaseVersion: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly slot: {
                        readonly required: true;
                        readonly type: "string";
                        readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                    };
                    readonly completed: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly nextSteps: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly evidenceDelta: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly blockers: {
                        readonly required: true;
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly workspaceFingerprint: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly observedAt: {
                        readonly type: "string";
                    };
                };
            };
            readonly currentTurnId: {
                readonly type: "string";
            };
            readonly interruptState: {
                readonly type: "string";
                readonly enum: readonly ["requested", "completed", "failed"];
            };
            readonly quarantinedFiles: {
                readonly type: "array";
                readonly items: {
                    readonly type: "string";
                };
            };
            readonly quarantineReviewed: {
                readonly type: "boolean";
            };
            readonly repairRound: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly executionRetries: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly executionReports: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly taskId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly taskVersion: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly leaseId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly leaseVersion: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly slot: {
                            readonly required: true;
                            readonly type: "string";
                            readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                        };
                        readonly generation: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly status: {
                            readonly type: "string";
                            readonly enum: readonly ["completed", "blocked", "failed"];
                            readonly required: true;
                        };
                        readonly summary: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly changedFiles: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly modifiedAssertions: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly file: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly test: {
                                        readonly type: "string";
                                    };
                                    readonly reason: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                };
                            };
                        };
                        readonly evidence: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly commandsRun: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly command: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly exitCode: {
                                        readonly type: "number";
                                    };
                                    readonly summary: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                };
                            };
                            readonly required: true;
                        };
                        readonly risks: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly remainingWork: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly workspaceFingerprint: {
                            readonly type: "string";
                        };
                    };
                };
                readonly required: true;
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const recoveryInstructionOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly instructionId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly runId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly slot: {
                readonly type: "string";
                readonly const: "healer";
                readonly required: true;
            };
            readonly action: {
                readonly type: "string";
                readonly const: "validator-maintenance";
                readonly required: true;
            };
            readonly status: {
                readonly type: "string";
                readonly enum: readonly ["issued", "completed", "failed"];
                readonly required: true;
            };
            readonly issuedAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly expiresAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly completedAt: {
                readonly type: "string";
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const checkpointRequestOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly requestId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly runId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly taskId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly taskVersion: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly leaseId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly leaseVersion: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly slot: {
                readonly required: true;
                readonly type: "string";
                readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
            };
            readonly status: {
                readonly type: "string";
                readonly enum: readonly ["issued", "completed", "expired"];
                readonly required: true;
            };
            readonly issuedAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly dueAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly completedAt: {
                readonly type: "string";
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const battleResRequestOutput: {
    schema: {
        readonly oneOf: readonly [{
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly resurrectionId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly runId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly targetSlot: {
                    readonly required: true;
                    readonly type: "string";
                    readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                };
                readonly targetSessionId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly status: {
                    readonly type: "string";
                    readonly enum: readonly ["issued", "consumed", "completed", "failed"];
                    readonly required: true;
                };
                readonly requestedAt: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly expiresAt: {
                    readonly type: "string";
                    readonly required: true;
                };
            };
        }, {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly ok: {
                    readonly type: "boolean";
                    readonly const: false;
                    readonly required: true;
                };
                readonly code: {
                    readonly type: "string";
                    readonly const: "MEMBER_NOT_DOWN";
                    readonly required: true;
                };
                readonly message: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly currentLifeState: {
                    readonly type: "string";
                    readonly enum: readonly ["alive", "down", "resurrection-requested", "resurrecting", "permanently-dead"];
                };
                readonly recommendedTools: {
                    readonly required: true;
                    readonly type: "array";
                    readonly items: {
                        readonly type: "string";
                    };
                };
            };
        }];
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const taskLeaseOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly leaseId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly ownerSlot: {
                readonly required: true;
                readonly type: "string";
                readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
            };
            readonly grantedAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly expiresAt: {
                readonly type: "string";
                readonly required: true;
            };
            readonly version: {
                readonly type: "integer";
                readonly required: true;
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const verificationOutput: {
    schema: {
        readonly oneOf: readonly [{
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly command: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly exitCode: {
                    readonly type: "number";
                };
                readonly errorCode: {
                    readonly type: "string";
                };
                readonly errorMessage: {
                    readonly type: "string";
                };
                readonly durationMs: {
                    readonly type: "number";
                    readonly required: true;
                };
                readonly outputExcerpt: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly beganAt: {
                    readonly type: "string";
                    readonly required: true;
                };
            };
        }, {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly code: {
                    readonly type: "string";
                    readonly const: "VERIFICATION_TIMEOUT";
                    readonly required: true;
                };
                readonly command: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly durationMs: {
                    readonly type: "number";
                    readonly required: true;
                };
                readonly outputExcerpt: {
                    readonly type: "string";
                    readonly required: true;
                };
            };
        }];
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const partyMessageOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly messageId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly runId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly fromSlot: {
                readonly required: true;
                readonly type: "string";
                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
            };
            readonly toSlot: {
                readonly required: true;
                readonly type: "string";
                readonly enum: readonly ["tank", "dps-1", "dps-2", "dps-3", "healer"];
            };
            readonly kind: {
                readonly type: "string";
                readonly enum: readonly ["progress", "blocked", "risk", "question", "decision", "notice"];
                readonly required: true;
            };
            readonly summary: {
                readonly type: "string";
                readonly required: true;
            };
            readonly evidence: {
                readonly required: true;
                readonly type: "array";
                readonly items: {
                    readonly type: "string";
                };
            };
            readonly createdAt: {
                readonly type: "string";
                readonly required: true;
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const validationManifestOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly runId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly manifestVersion: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly taskSetVersion: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly workspaceFingerprint: {
                readonly type: "string";
                readonly required: true;
            };
            readonly criteria: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly criterionId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly taskId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly taskVersion: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly description: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly required: {
                            readonly type: "boolean";
                            readonly required: true;
                        };
                    };
                };
            };
            readonly fingerprintIgnoreScopes: {
                readonly required: true;
                readonly type: "array";
                readonly items: {
                    readonly type: "string";
                };
            };
            readonly createdAt: {
                readonly type: "string";
                readonly required: true;
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const validationReportOutput: {
    schema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly runId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly validationId: {
                readonly type: "string";
                readonly required: true;
            };
            readonly verdict: {
                readonly type: "string";
                readonly enum: readonly ["pass", "fail", "blocked"];
                readonly required: true;
            };
            readonly status: {
                readonly type: "string";
                readonly enum: readonly ["current", "stale"];
                readonly required: true;
            };
            readonly taskSetVersion: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly manifestVersion: {
                readonly type: "integer";
                readonly required: true;
            };
            readonly workspaceFingerprint: {
                readonly type: "string";
                readonly required: true;
            };
            readonly checks: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly criterionId: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly status: {
                            readonly type: "string";
                            readonly enum: readonly ["pass", "fail", "blocked", "not-applicable"];
                            readonly required: true;
                        };
                        readonly evidence: {
                            readonly required: true;
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly notApplicableReason: {
                            readonly type: "string";
                        };
                    };
                };
                readonly required: true;
            };
            readonly findings: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly id: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly severity: {
                            readonly type: "string";
                            readonly enum: readonly ["critical", "major", "minor"];
                            readonly required: true;
                        };
                        readonly ownerTaskId: {
                            readonly type: "string";
                        };
                        readonly title: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly evidence: {
                            readonly type: "string";
                            readonly required: true;
                        };
                        readonly remediation: {
                            readonly type: "string";
                            readonly required: true;
                        };
                    };
                };
                readonly required: true;
            };
            readonly summary: {
                readonly type: "string";
                readonly required: true;
            };
            readonly createdAt: {
                readonly type: "string";
                readonly required: true;
            };
        };
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const battleResActionOutput: {
    schema: {
        readonly oneOf: readonly [{
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly resurrectionId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly runId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly targetSlot: {
                    readonly required: true;
                    readonly type: "string";
                    readonly enum: readonly ["dps-1", "dps-2", "dps-3"];
                };
                readonly targetSessionId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly status: {
                    readonly type: "string";
                    readonly enum: readonly ["issued", "consumed", "completed", "failed"];
                    readonly required: true;
                };
                readonly requestedAt: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly expiresAt: {
                    readonly type: "string";
                    readonly required: true;
                };
            };
        }, {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly ticketId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly runId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly targetSlot: {
                    readonly type: "string";
                    readonly const: "tank";
                    readonly required: true;
                };
                readonly targetSessionId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly healerSessionId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly commanderCheckpointId: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly status: {
                    readonly type: "string";
                    readonly enum: readonly ["issued", "consumed", "completed", "failed", "expired"];
                    readonly required: true;
                };
                readonly issuedAt: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly expiresAt: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly recoveryExpiresAt: {
                    readonly type: "string";
                };
                readonly version: {
                    readonly type: "integer";
                    readonly required: true;
                };
            };
        }];
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
