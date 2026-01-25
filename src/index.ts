#!/usr/bin/env node
/**
 * Clawdbot Sendblue Channel Adapter
 *
 * HTTP daemon that bridges Sendblue iMessage/SMS API to clawdbot's
 * JSON-RPC + SSE channel protocol.
 *
 * Endpoints:
 * - GET  /api/v1/check   → Health check
 * - GET  /api/v1/events  → SSE event stream
 * - POST /api/v1/rpc     → JSON-RPC handler
 */

import http from 'http';
import { sseManager } from './sse.js';
import { handleRpc } from './rpc.js';
import { poller } from './poller.js';
import { initDb, closeDb } from './db.js';
import type { Config, JsonRpcRequest } from './types.js';

// Load configuration from environment
function loadConfig(): Config {
  const apiKey = process.env.SENDBLUE_API_KEY;
  const apiSecret = process.env.SENDBLUE_API_SECRET;
  const phoneNumber = process.env.SENDBLUE_PHONE_NUMBER;

  if (!apiKey || !apiSecret || !phoneNumber) {
    console.error('[Config] Missing required environment variables:');
    if (!apiKey) console.error('  - SENDBLUE_API_KEY');
    if (!apiSecret) console.error('  - SENDBLUE_API_SECRET');
    if (!phoneNumber) console.error('  - SENDBLUE_PHONE_NUMBER');
    process.exit(1);
  }

  const allowlistStr = process.env.SENDBLUE_ALLOWLIST || '';
  const allowlist = allowlistStr
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const pollIntervalMs = parseInt(process.env.SENDBLUE_POLL_INTERVAL_MS || '5000', 10);
  const port = parseInt(process.env.PORT || '18790', 10);

  return {
    sendblue: {
      apiKey,
      apiSecret,
      phoneNumber,
    },
    allowlist,
    pollIntervalMs,
    port,
  };
}

// Parse JSON body from request
async function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Create HTTP server
function createServer(config: Config): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${config.port}`);
    const path = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Health check
      if (path === '/api/v1/check' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // SSE event stream
      if (path === '/api/v1/events' && req.method === 'GET') {
        sseManager.addClient(res);
        return; // Connection kept open
      }

      // JSON-RPC handler
      if (path === '/api/v1/rpc' && req.method === 'POST') {
        const body = await parseJsonBody(req) as JsonRpcRequest;
        const response = await handleRpc(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        return;
      }

      // 404 for unknown routes
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Server] Request error:', errorMsg);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: errorMsg }));
    }
  });

  return server;
}

// Graceful shutdown
function shutdown(server: http.Server, signal: string): void {
  console.log(`\n[Server] ${signal} received, shutting down...`);

  poller.stop();
  sseManager.shutdown();
  closeDb();

  server.close(() => {
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.log('[Server] Force exit');
    process.exit(1);
  }, 5000);
}

// Main entry point
async function main(): Promise<void> {
  console.log('===========================================');
  console.log('  Clawdbot Sendblue Channel Adapter v1.0.0');
  console.log('===========================================');

  // Load config
  const config = loadConfig();
  console.log(`[Config] Phone: ${config.sendblue.phoneNumber}`);
  console.log(`[Config] Allowlist: ${config.allowlist.length > 0 ? config.allowlist.join(', ') : '(none - accepting all)'}`);
  console.log(`[Config] Poll interval: ${config.pollIntervalMs}ms`);
  console.log(`[Config] Port: ${config.port}`);

  // Initialize database
  initDb();
  console.log('[DB] Initialized');

  // Initialize poller (but don't start yet - wait for watch.subscribe)
  poller.init(config);

  // Create and start server
  const server = createServer(config);

  server.listen(config.port, () => {
    console.log(`[Server] Listening on http://localhost:${config.port}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`  GET  http://localhost:${config.port}/api/v1/check   → Health check`);
    console.log(`  GET  http://localhost:${config.port}/api/v1/events  → SSE stream`);
    console.log(`  POST http://localhost:${config.port}/api/v1/rpc     → JSON-RPC`);
    console.log('');
    console.log('Waiting for watch.subscribe RPC call to start polling...');
  });

  // Handle shutdown signals
  process.on('SIGINT', () => shutdown(server, 'SIGINT'));
  process.on('SIGTERM', () => shutdown(server, 'SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught exception:', error);
    shutdown(server, 'uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
  });
}

main().catch((error) => {
  console.error('[Server] Fatal error:', error);
  process.exit(1);
});
