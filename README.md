# clawdbot-sendblue

Sendblue channel adapter for [clawdbot](https://clawd.bot) - enables iMessage/SMS messaging via the Sendblue API.

## Why?

- **No Mac Required**: Unlike BlueBubbles, Sendblue is cloud-based - works from any server
- **Free Tier**: Sendblue offers a free developer tier for testing
- **Simple Setup**: Just API keys, no local daemons or QR codes

## Quick Start

### 1. Get Sendblue Credentials

1. Sign up at [dashboard.sendblue.com](https://dashboard.sendblue.com/company-signup)
2. Get your **API Key** and **API Secret** from Dashboard → API Keys
3. Note your assigned **phone number**

### 2. Install

```bash
cd clawdbot-sendblue
npm install
npm run build
```

### 3. Configure Environment

```bash
export SENDBLUE_API_KEY="your-api-key"
export SENDBLUE_API_SECRET="your-api-secret"
export SENDBLUE_PHONE_NUMBER="+15551234567"
export SENDBLUE_ALLOWLIST="+15559876543,+15551111111"  # Optional
export PORT=18790  # Optional, default 18790
```

### 4. Run Standalone (for testing)

```bash
npm start
# or
npm run dev
```

### 5. Configure Clawdbot

Add to `~/.clawdbot/clawdbot.json`:

```json5
{
  channels: {
    sendblue: {
      // Adapter daemon configuration
      adapter: {
        command: "node",
        args: ["/path/to/clawdbot-sendblue/dist/index.js"],
        env: {
          SENDBLUE_API_KEY: "${SENDBLUE_API_KEY}",
          SENDBLUE_API_SECRET: "${SENDBLUE_API_SECRET}",
          SENDBLUE_PHONE_NUMBER: "${SENDBLUE_PHONE_NUMBER}",
          SENDBLUE_ALLOWLIST: "${SENDBLUE_ALLOWLIST}",
          PORT: "18790"
        }
      },

      // Access control
      allowFrom: ["${SENDBLUE_ALLOWLIST}"],
      dmPolicy: "allowlist"
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENDBLUE_API_KEY` | Yes | - | Sendblue API key |
| `SENDBLUE_API_SECRET` | Yes | - | Sendblue API secret |
| `SENDBLUE_PHONE_NUMBER` | Yes | - | Your Sendblue phone number |
| `SENDBLUE_ALLOWLIST` | No | (all) | Comma-separated phone numbers to accept |
| `SENDBLUE_POLL_INTERVAL_MS` | No | 5000 | Polling interval in milliseconds |
| `PORT` | No | 18790 | HTTP server port |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/check` | GET | Health check → `{ status: "ok" }` |
| `/api/v1/events` | GET | SSE event stream |
| `/api/v1/rpc` | POST | JSON-RPC handler |

## JSON-RPC Methods

### `watch.subscribe`
Start polling Sendblue for new messages.
```json
{ "method": "watch.subscribe", "id": 1 }
→ { "result": { "subscribed": true }, "id": 1 }
```

### `watch.unsubscribe`
Stop polling.
```json
{ "method": "watch.unsubscribe", "id": 2 }
→ { "result": { "unsubscribed": true }, "id": 2 }
```

### `send`
Send a message via Sendblue.
```json
{
  "method": "send",
  "params": {
    "to": "+15559876543",
    "content": "Hello from clawdbot!",
    "media_url": "https://..." // optional
  },
  "id": 3
}
→ { "result": { "messageId": "..." }, "id": 3 }
```

### `chats.list`
Get list of all conversations.
```json
{ "method": "chats.list", "id": 4 }
→ { "result": { "chats": [...] }, "id": 4 }
```

### `chats.history`
Get conversation history.
```json
{ "method": "chats.history", "params": { "chat_id": "+15559876543", "limit": 50 }, "id": 5 }
→ { "result": { "messages": [...] }, "id": 5 }
```

### `status`
Get adapter status.
```json
{ "method": "status", "id": 6 }
→ { "result": { "running": true, "version": "1.0.0" }, "id": 6 }
```

## SSE Events

When a new message arrives, the adapter broadcasts via SSE:

```json
{
  "method": "message",
  "params": {
    "chat_id": "+15559876543",
    "from": "+15559876543",
    "content": "Hello!",
    "timestamp": 1706000000000,
    "message_id": "msg-abc123",
    "media_url": "https://..." // if media attached
  }
}
```

## Testing

```bash
# Health check
curl http://localhost:18790/api/v1/check

# Subscribe to events
curl -N http://localhost:18790/api/v1/events

# Start polling
curl -X POST http://localhost:18790/api/v1/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"watch.subscribe","id":1}'

# Send message
curl -X POST http://localhost:18790/api/v1/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"send","params":{"to":"+15559876543","content":"Test"},"id":2}'

# List chats
curl -X POST http://localhost:18790/api/v1/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"chats.list","id":3}'
```

## Data Storage

The adapter stores data in `~/.config/clawdbot-sendblue/`:
- `adapter.db` - SQLite database for message deduplication and conversation history

## Architecture

```
User (iPhone)
     │
     ▼ iMessage/SMS
┌─────────────────┐
│  Sendblue API   │
└────────┬────────┘
         │ poll every 5s
         ▼
┌─────────────────────────────┐
│  clawdbot-sendblue adapter  │
│  • HTTP server              │
│  • SSE broadcast            │
│  • JSON-RPC handler         │
└────────────┬────────────────┘
             │ JSON-RPC + SSE
             ▼
┌─────────────────────────────┐
│     Clawdbot Gateway        │
└─────────────────────────────┘
```

## License

MIT
