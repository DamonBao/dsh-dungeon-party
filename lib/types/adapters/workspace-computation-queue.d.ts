import { type WorkspaceSnapshot } from './workspace-fingerprint.js';
export declare class WorkspaceComputationQueue {
    private worker;
    private nextId;
    private readonly queued;
    private active;
    snapshot(workspaceRoot: string, ignoreScopes: string[]): Promise<WorkspaceSnapshot>;
    fingerprint(workspaceRoot: string, ignoreScopes: string[]): Promise<string>;
    dispose(): Promise<void>;
    private dispatchNext;
    private ensureWorker;
}
/** Process-wide FIFO: isolated Agent realms share one CPU work queue. */
export declare const workspaceComputationQueue: WorkspaceComputationQueue;
