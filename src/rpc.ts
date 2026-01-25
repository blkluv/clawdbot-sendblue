/**
 * JSON-RPC method handlers for clawdbot channel compatibility
 */

import { poller } from './poller.js';
import { getAllChats, getConversationHistory, clearConversationHistory } from './db.js';
import type { JsonRpcRequest, JsonRpcResponse, SendParams } from './types.js';

/**
 * Create a success response
 */
function success(id: string | number | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    result,
    id,
  };
}

/**
 * Create an error response
 */
function error(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    error: { code, message, data },
    id,
  };
}

/**
 * Handle JSON-RPC requests
 */
export async function handleRpc(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { method, params, id } = request;
  const rpcId = id ?? null;

  console.log(`[RPC] ${method}`, params ? JSON.stringify(params).substring(0, 100) : '');

  try {
    switch (method) {
      // --- Watch Methods ---

      case 'watch.subscribe': {
        poller.start();
        return success(rpcId, { subscribed: true });
      }

      case 'watch.unsubscribe': {
        poller.stop();
        return success(rpcId, { unsubscribed: true });
      }

      // --- Message Methods ---

      case 'send': {
        const p = params as SendParams | undefined;
        if (!p?.to || p?.content === undefined) {
          return error(rpcId, -32602, 'Invalid params: "to" and "content" required');
        }

        const result = await poller.sendMessage(p.to, p.content, p.media_url);
        return success(rpcId, result);
      }

      // --- Chat Methods ---

      case 'chats.list': {
        const chats = getAllChats();
        return success(rpcId, { chats });
      }

      case 'chats.history': {
        const p = params as { chat_id?: string; limit?: number } | undefined;
        if (!p?.chat_id) {
          return error(rpcId, -32602, 'Invalid params: "chat_id" required');
        }

        const history = getConversationHistory(p.chat_id, p.limit ?? 50);
        return success(rpcId, { messages: history });
      }

      case 'chats.clear': {
        const p = params as { chat_id?: string } | undefined;
        if (!p?.chat_id) {
          return error(rpcId, -32602, 'Invalid params: "chat_id" required');
        }

        clearConversationHistory(p.chat_id);
        return success(rpcId, { cleared: true });
      }

      // --- Status Methods ---

      case 'status': {
        return success(rpcId, {
          running: poller.isActive(),
          version: '1.0.0',
        });
      }

      // --- Unknown Method ---

      default:
        return error(rpcId, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[RPC] Error in ${method}:`, errorMsg);
    return error(rpcId, -32603, `Internal error: ${errorMsg}`);
  }
}
