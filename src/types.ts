/**
 * Type definitions for clawdbot-sendblue adapter
 */

// Configuration loaded from environment variables
export interface Config {
  sendblue: {
    apiKey: string;
    apiSecret: string;
    phoneNumber: string;
  };
  allowlist: string[];
  pollIntervalMs: number;
  port: number;
}

// Sendblue API message format
export interface SendblueMessage {
  message_handle: string;
  content: string;
  from_number: string;
  to_number: string;
  number: string;
  status: string;
  date_sent: string;
  date_updated: string;
  created_at?: string;
  is_outbound: boolean;
  media_url?: string;
}

// Conversation message stored in DB
export interface ConversationMessage {
  id: number;
  chat_id: string;
  from_number: string;
  content: string;
  timestamp: number;
  is_outbound: boolean;
}

// Chat summary for chats.list RPC method
export interface ChatInfo {
  chat_id: string;
  last_message?: string;
  last_timestamp?: number;
  message_count: number;
}

// JSON-RPC request format
export interface JsonRpcRequest {
  jsonrpc?: string;
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

// JSON-RPC response format
export interface JsonRpcResponse {
  jsonrpc: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number | null;
}

// SSE event format for clawdbot
export interface SseEvent {
  method: string;
  params: Record<string, unknown>;
}

// Message event params (sent via SSE when new message arrives)
export interface MessageEventParams {
  chat_id: string;
  from: string;
  content: string;
  media_url?: string;
  timestamp: number;
  message_id: string;
  [key: string]: unknown; // Index signature for Record compatibility
}

// Send RPC params
export interface SendParams {
  to: string;
  content: string;
  media_url?: string;
}

// Processed message record (for deduplication)
export interface ProcessedMessage {
  message_id: string;
  processed_at: number;
}
