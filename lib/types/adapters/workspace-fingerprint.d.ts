export type WorkspaceSnapshot = Record<string, string>;
/** Capture file and symlink content digests without following workspace symlinks. */
export declare function createWorkspaceSnapshot(workspaceRoot: string, ignoreScopes?: string[]): WorkspaceSnapshot;
export declare function diffWorkspaceSnapshots(before: WorkspaceSnapshot, after: WorkspaceSnapshot): string[];
/** Compute a deterministic digest from an already captured snapshot. */
export declare function computeWorkspaceFingerprintFromSnapshot(workspaceRoot: string, snapshot: WorkspaceSnapshot): string;
/** Compute a deterministic digest without following workspace symlinks. */
export declare function computeWorkspaceFingerprint(workspaceRoot: string, ignoreScopes?: string[]): string;
