/**
 * Server-Sent Events (SSE) connection manager
 * Handles multiple connected clients and broadcasts events
 */

import type { ServerResponse } from 'http';
import type { SseEvent } from './types.js';

interface SseClient {
  id: string;
  response: ServerResponse;
  connectedAt: number;
}

class SseManager {
  private clients: Map<string, SseClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatIntervalMs = 30000; // 30 seconds

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Add a new SSE client connection
   */
  addClient(response: ServerResponse): string {
    const id = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Set SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection event
    response.write(`data: ${JSON.stringify({ connected: true, id })}\n\n`);

    const client: SseClient = {
      id,
      response,
      connectedAt: Date.now(),
    };

    this.clients.set(id, client);
    console.log(`[SSE] Client connected: ${id} (total: ${this.clients.size})`);

    // Handle client disconnect
    response.on('close', () => {
      this.removeClient(id);
    });

    return id;
  }

  /**
   * Remove a client connection
   */
  removeClient(id: string): void {
    if (this.clients.has(id)) {
      this.clients.delete(id);
      console.log(`[SSE] Client disconnected: ${id} (total: ${this.clients.size})`);
    }
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: SseEvent): void {
    const data = JSON.stringify(event);
    const message = `data: ${data}\n\n`;

    let sentCount = 0;
    const deadClients: string[] = [];

    for (const [id, client] of this.clients) {
      try {
        if (!client.response.writableEnded) {
          client.response.write(message);
          sentCount++;
        } else {
          deadClients.push(id);
        }
      } catch (error) {
        console.error(`[SSE] Error sending to ${id}:`, error);
        deadClients.push(id);
      }
    }

    // Clean up dead clients
    for (const id of deadClients) {
      this.removeClient(id);
    }

    if (sentCount > 0) {
      console.log(`[SSE] Broadcast to ${sentCount} client(s): ${event.method}`);
    }
  }

  /**
   * Send a heartbeat to keep connections alive
   */
  private sendHeartbeat(): void {
    if (this.clients.size === 0) return;

    const message = `: heartbeat ${Date.now()}\n\n`;
    const deadClients: string[] = [];

    for (const [id, client] of this.clients) {
      try {
        if (!client.response.writableEnded) {
          client.response.write(message);
        } else {
          deadClients.push(id);
        }
      } catch {
        deadClients.push(id);
      }
    }

    for (const id of deadClients) {
      this.removeClient(id);
    }
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Shutdown - close all connections
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [id, client] of this.clients) {
      try {
        client.response.end();
      } catch {
        // Ignore errors during shutdown
      }
    }

    this.clients.clear();
    console.log('[SSE] Shutdown complete');
  }
}

// Singleton instance
export const sseManager = new SseManager();
