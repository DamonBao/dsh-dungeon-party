import type { Context } from '@deepseek-ai/cordis';
import type { PartyAgentManager } from '../adapters/party-agent-manager.js';
import { type DungeonService } from '../service/dungeon-service.js';
/**
 * Bound free-form text for tool output. Non-string input (numbers, objects,
 * arrays) is dropped instead of being implicitly stringified, so a corrupted
 * or hostile value can never blow up the caller's context budget.
 */
export declare function boundedText(value: unknown, limit?: number): string | undefined;
export declare function registerDungeonTools(ctx: Context, service: DungeonService, agentManager?: PartyAgentManager): () => void;
