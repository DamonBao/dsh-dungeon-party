import type { Context } from '@deepseek-ai/cordis';
import type { PartyAgentManager } from '../adapters/party-agent-manager.js';
import { type DungeonService } from '../service/dungeon-service.js';
export declare function registerDungeonTools(ctx: Context, service: DungeonService, agentManager?: PartyAgentManager): () => void;
