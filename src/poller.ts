/**
 * Sendblue message poller
 * Polls for new messages and broadcasts via SSE
 */

import { SendblueClient } from './sendblue.js';
import { sseManager } from './sse.js';
import {
  isMessageProcessed,
  markMessageProcessed,
  addConversationMessage,
  cleanupOldProcessedMessages,
} from './db.js';
import type { Config, MessageEventParams, SendblueMessage } from './types.js';

class Poller {
  private sendblue: SendblueClient | null = null;
  private config: Config | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastPollTime: Date = new Date(Date.now() - 60 * 1000);
  private isPolling = false;
  private isRunning = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the poller with configuration
   */
  init(config: Config): void {
    this.config = config;
    this.sendblue = new SendblueClient(config.sendblue);
    console.log(`[Poller] Initialized with phone: ${config.sendblue.phoneNumber}`);
    console.log(`[Poller] Allowlist: ${config.allowlist.join(', ') || '(none - accepting all)'}`);
  }

  /**
   * Start polling for messages
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Poller] Already running');
      return;
    }

    if (!this.config || !this.sendblue) {
      throw new Error('Poller not initialized - call init() first');
    }

    this.isRunning = true;
    console.log(`[Poller] Starting (interval: ${this.config.pollIntervalMs}ms)`);

    // Initial poll
    this.poll();

    // Start polling interval
    this.pollInterval = setInterval(() => {
      this.poll();
    }, this.config.pollIntervalMs);

    // Cleanup old processed messages periodically
    this.cleanupInterval = setInterval(() => {
      cleanupOldProcessedMessages();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
    console.log('[Poller] Stopped');
  }

  /**
   * Check if a phone number is in the allowlist
   */
  private isAllowed(phoneNumber: string): boolean {
    if (!this.config || this.config.allowlist.length === 0) {
      return true; // No allowlist = accept all
    }

    const normalize = (num: string) => num.replace(/\D/g, '');
    const normalized = normalize(phoneNumber);
    return this.config.allowlist.some(w => normalize(w) === normalized);
  }

  /**
   * Poll for new messages
   */
  private async poll(): Promise<void> {
    if (this.isPolling || !this.sendblue) {
      return;
    }

    try {
      this.isPolling = true;
      const pollStart = Date.now();

      const messages = await this.sendblue.getInboundMessages(this.lastPollTime);
      this.lastPollTime = new Date();

      const pollDuration = Date.now() - pollStart;

      if (messages.length > 0) {
        console.log(`[Poller] ${messages.length} message(s) (${pollDuration}ms)`);
      }

      for (const msg of messages) {
        await this.processMessage(msg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Poller] Poll error:', errorMsg);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(msg: SendblueMessage): Promise<void> {
    // Skip if already processed
    if (isMessageProcessed(msg.message_handle)) {
      return;
    }

    // Mark as processed immediately to avoid duplicates
    markMessageProcessed(msg.message_handle);

    // Check allowlist
    if (!this.isAllowed(msg.from_number)) {
      console.log(`[Poller] Skipping message from non-allowed number: ${msg.from_number.slice(-4)}`);
      return;
    }

    const content = msg.content?.trim() || '';
    const mediaUrl = msg.media_url;

    // Skip if no content and no media
    if (!content && !mediaUrl) {
      return;
    }

    // Build message content (include media URL if present)
    let messageContent = content;
    if (mediaUrl) {
      const mediaNotice = `[Media: ${mediaUrl}]`;
      messageContent = content ? `${content}\n\n${mediaNotice}` : mediaNotice;
    }

    console.log(`[Poller] New message from ${msg.from_number.slice(-4)}: "${messageContent.substring(0, 60)}${messageContent.length > 60 ? '...' : ''}"`);

    // Store in conversation history
    addConversationMessage(
      msg.from_number, // chat_id = phone number for SMS/iMessage
      msg.from_number,
      messageContent,
      false // is_outbound
    );

    // Broadcast via SSE to clawdbot gateway
    const eventParams: MessageEventParams = {
      chat_id: msg.from_number,
      from: msg.from_number,
      content: messageContent,
      timestamp: new Date(msg.date_sent).getTime(),
      message_id: msg.message_handle,
    };

    if (mediaUrl) {
      eventParams.media_url = mediaUrl;
    }

    sseManager.broadcast({
      method: 'message',
      params: eventParams,
    });
  }

  /**
   * Send a message (called from RPC handler)
   */
  async sendMessage(to: string, content: string, mediaUrl?: string): Promise<{ messageId: string }> {
    if (!this.sendblue) {
      throw new Error('Poller not initialized');
    }

    const result = await this.sendblue.sendMessage(to, content, mediaUrl);

    // Store in conversation history
    addConversationMessage(
      to, // chat_id
      this.config!.sendblue.phoneNumber, // from our number
      content,
      true // is_outbound
    );

    return result;
  }

  /**
   * Get the Sendblue client
   */
  getSendblueClient(): SendblueClient | null {
    return this.sendblue;
  }

  /**
   * Check if poller is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
export const poller = new Poller();
