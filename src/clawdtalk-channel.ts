/**
 * ClawdTalk Channel Plugin for Clawdbot
 * Implements voice channel using ClawdTalk
 */

import type { ClawdtalkConfig } from './types.js';

let clawdbotApi: any = null;
let channelConfig: ClawdtalkConfig | null = null;

/**
 * Logger helper
 */
function log(level: 'info' | 'warn' | 'error', message: string): void {
  const prefix = '[ClawdTalk]';
  if (clawdbotApi?.logger) {
    clawdbotApi.logger[level](`${prefix} ${message}`);
  } else {
    const fn = level === 'error' ? console.error : console.log;
    fn(`${prefix} ${message}`);
  }
}

/**
 * Process inbound transcript from ClawdTalk
 */
async function processVoiceMessage(payload: {
  sessionId: string;
  transcript: string;
  callerId?: string;
  timestamp?: number;
}) {
  const runtime = clawdbotApi?.runtime;

  if (!runtime?.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
    log('error', 'dispatchReplyWithBufferedBlockDispatcher not available');
    return;
  }

  const { sessionId, transcript, callerId } = payload;

  log('info', `Voice inbound ${sessionId}: "${transcript.slice(0, 50)}..."`);

  const ctxPayload = {
    Body: transcript,
    BodyForAgent: transcript,
    RawBody: transcript,
    From: `clawdtalk:${callerId || sessionId}`,
    To: `clawdtalk:${channelConfig?.agentId || 'agent'}`,
    SessionKey: `clawdtalk:${sessionId}`,
    AccountId: 'default',
    ChatType: 'direct',
    SenderId: callerId || sessionId,
    SenderName: callerId || 'Voice Caller',
    MessageSid: sessionId.slice(-8),
    MessageSidFull: sessionId,
    Timestamp: payload.timestamp || Date.now(),
    Provider: 'clawdtalk',
    Surface: 'voice',
    OriginatingChannel: 'clawdtalk',
  };

  try {
    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: clawdbotApi.config,
      dispatcherOptions: {
        deliver: async (replyPayload: { text?: string }) => {
          if (replyPayload.text) {
            await sendVoiceReply(sessionId, replyPayload.text);
            log('info', `Voice reply sent for ${sessionId}`);
          }
        },
        onReplyStart: async () => {
          log('info', 'Voice agent starting reply...');
        },
        onIdle: async () => {
          log('info', 'Voice agent idle');
        },
        onError: (err: Error) => {
          log('error', `Voice dispatch error: ${err.message}`);
        },
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('error', `Voice processing failed: ${errorMsg}`);
  }
}

/**
 * Send voice reply back to ClawdTalk transport
 */
async function sendVoiceReply(sessionId: string, text: string): Promise<void> {
  // Replace this with real ClawdTalk API call
  await fetch(`${channelConfig?.webhookUrl}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelConfig?.apiKey}`,
    },
    body: JSON.stringify({
      sessionId,
      text,
    }),
  });
}

/**
 * Create ClawdTalk channel plugin
 */
export function createClawdtalkChannel(api: any) {
  clawdbotApi = api;

  return {
    id: 'clawdtalk',

    meta: {
      id: 'clawdtalk',
      label: 'ClawdTalk',
      selectionLabel: 'Voice via ClawdTalk',
      docsPath: '/channels/clawdtalk',
      blurb: 'Voice conversations powered by ClawdTalk',
      aliases: ['voice'],
    },

    config: {
      listAccountIds: (_cfg: any) => ['default'],
      resolveAccount: (cfg: any, _accountId: string) =>
        cfg.plugins?.entries?.clawdtalk?.config ?? cfg.channels?.clawdtalk ?? cfg,
    },

    capabilities: {
      chatTypes: ['direct'],
    },

    outbound: {
      deliveryMode: 'direct',
      sendText: async ({ text, chatId }: { text: string; chatId: string }) => {
        await sendVoiceReply(chatId, text);
        return { ok: true };
      },
    },

    gateway: {
      start: async (config: ClawdtalkConfig) => {
        channelConfig = config;
        log('info', 'ClawdTalk channel started');
      },
      stop: async () => {
        log('info', 'ClawdTalk channel stopped');
      },
    },

    // Custom method to be triggered by your webhook server
    handleInbound: processVoiceMessage,
  };
}