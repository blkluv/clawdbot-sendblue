/**
 * Webhook server for receiving messages in real-time (multi-instance safe)
 * - Supports multiple concurrent webhook servers (e.g., sendblue + clawdtalk)
 * - Each server is keyed by a unique serverId (usually the channel id)
 */

import http from 'http';
import type { SendblueMessage } from './types.js';

// Maximum request body size (1MB)
const MAX_BODY_SIZE = 1024 * 1024;

// --- Rate Limiter ---

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

class InMemoryRateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(windowMs: number = 60000, maxRequests: number = 60) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(identifier);

    if (!entry || now - entry.windowStart > this.windowMs) {
      this.requests.set(identifier, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= this.maxRequests) return false;

    entry.count++;
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests) {
      if (now - entry.windowStart > this.windowMs) {
        this.requests.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.requests.clear();
  }
}

// --- Webhook Server ---

export interface WebhookServerConfig {
  port: number;
  path: string;
  secret?: string;
  rateLimit?: {
    windowMs?: number;
    maxRequests?: number;
  };
  onMessage: (message: SendblueMessage) => Promise<void>;
  logger?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
}

// Multi-instance state keyed by serverId (use channel id like "sendblue")
const servers = new Map<string, http.Server>();
const rateLimiters = new Map<string, InMemoryRateLimiter>();

/**
 * Validate that the payload has required SendblueMessage fields
 */
function isValidSendbluePayload(payload: unknown): payload is SendblueMessage {
  if (typeof payload !== 'object' || payload === null) return false;
  const obj = payload as Record<string, unknown>;
  return (
    typeof obj.message_handle === 'string' &&
    typeof obj.from_number === 'string' &&
    obj.message_handle.length > 0 &&
    obj.from_number.length > 0
  );
}

/**
 * Verify webhook secret from request headers
 * Sendblue may use different header names - we check common ones
 */
function verifySecret(req: http.IncomingMessage, expectedSecret: string): boolean {
  const headers = req.headers;

  const providedSecret =
    headers['x-sendblue-secret'] ||
    headers['x-webhook-secret'] ||
    headers['x-api-key'] ||
    headers['authorization'];

  if (typeof providedSecret === 'string') {
    const token = providedSecret.startsWith('Bearer ')
      ? providedSecret.slice(7)
      : providedSecret;
    return token === expectedSecret;
  }

  return false;
}

/**
 * Start a webhook server instance.
 * IMPORTANT: serverId must be unique per instance (e.g., "sendblue", "clawdtalk")
 */
export function startWebhookServer(serverId: string, config: WebhookServerConfig): void {
  const { port, path, secret, rateLimit: rateLimitConfig, onMessage, logger } = config;
  const log = logger || { info: console.log, error: console.error };

  if (!serverId || typeof serverId !== 'string') {
    throw new Error('startWebhookServer requires a non-empty serverId string');
  }

  if (servers.has(serverId)) {
    log.info(`[Webhook:${serverId}] Server already running`);
    return;
  }

  // Initialize rate limiter for this server
  const limiter = new InMemoryRateLimiter(
    rateLimitConfig?.windowMs || 60000,
    rateLimitConfig?.maxRequests || 60
  );
  rateLimiters.set(serverId, limiter);

  const server = http.createServer((req, res) => {
    const clientIP = req.socket.remoteAddress || 'unknown';

    // Health check endpoint (scoped)
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', serverId }));
      return;
    }

    // Only handle POST requests to the webhook path
    if (req.method !== 'POST' || !req.url?.startsWith(path)) {
      res.writeHead(404);
      res.end();
      return;
    }

    // Rate limiting
    const activeLimiter = rateLimiters.get(serverId);
    if (activeLimiter && !activeLimiter.isAllowed(clientIP)) {
      log.error(`[Webhook:${serverId}] Rate limit exceeded for ${clientIP}`);
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '60',
      });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

    // Secret verification (if configured)
    if (secret && !verifySecret(req, secret)) {
      log.error(`[Webhook:${serverId}] Invalid or missing secret from ${clientIP}`);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Collect request body with size limit
    let body = '';
    let bodyTooLarge = false;

    req.on('data', (chunk: Buffer) => {
      if (bodyTooLarge) return;

      body += chunk.toString();
      if (body.length > MAX_BODY_SIZE) {
        bodyTooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('error', (err) => {
      log.error(`[Webhook:${serverId}] Request error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });

    req.on('end', async () => {
      if (bodyTooLarge || res.headersSent) return;

      // Parse JSON
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      // Validate required fields (Sendblue-specific)
      if (!isValidSendbluePayload(payload)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payload: missing required fields' }));
        return;
      }

      // Respond 200 OK - payload is valid, we'll process it async
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));

      // Only process inbound messages
      if ((payload as any).is_outbound) return;

      try {
        log.info(`[Webhook:${serverId}] Received message from ${payload.from_number.slice(-4)}`);
        await onMessage(payload);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`[Webhook:${serverId}] Error processing message: ${errorMsg}`);
      }
    });
  });

  servers.set(serverId, server);

  server.listen(port, () => {
    log.info(`[Webhook:${serverId}] Server listening on port ${port}`);
    log.info(`[Webhook:${serverId}] Endpoint: http://localhost:${port}${path}`);
    if (secret) log.info(`[Webhook:${serverId}] Secret verification enabled`);
    log.info(
      `[Webhook:${serverId}] Rate limit: ${rateLimitConfig?.maxRequests || 60} req/${(rateLimitConfig?.windowMs || 60000) / 1000}s`
    );
  });

  server.on('error', (error) => {
    log.error(`[Webhook:${serverId}] Server error: ${error.message}`);
  });
}

/**
 * Stop a specific webhook server instance by serverId.
 */
export function stopWebhookServer(serverId: string): Promise<void> {
  return new Promise((resolve) => {
    const limiter = rateLimiters.get(serverId);
    if (limiter) {
      limiter.destroy();
      rateLimiters.delete(serverId);
    }

    const server = servers.get(serverId);
    if (!server) {
      resolve();
      return;
    }

    server.close(() => {
      servers.delete(serverId);
      resolve();
    });
  });
}

/**
 * Stop all webhook server instances.
 */
export async function stopAllWebhookServers(): Promise<void> {
  const ids = Array.from(servers.keys());
  await Promise.all(ids.map((id) => stopWebhookServer(id)));
}

/**
 * Check if a specific webhook server instance is running.
 */
export function isWebhookServerRunning(serverId: string): boolean {
  return servers.has(serverId);
}

/**
 * List running server IDs (useful for debugging).
 */
export function listRunningWebhookServers(): string[] {
  return Array.from(servers.keys());
}