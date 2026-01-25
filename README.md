# clawdbot-sendblue

Clawdbot plugin for iMessage/SMS messaging via the [Sendblue](https://sendblue.co) API.

## Why?

- **No Mac Required**: Unlike BlueBubbles, Sendblue is cloud-based - works from any server
- **Free Tier**: Sendblue offers a free developer tier for testing
- **Simple Setup**: Just API keys, no local daemons or QR codes
- **Native Integration**: Registers as a clawdbot channel plugin

## Quick Start

### 1. Get Sendblue Credentials

1. Sign up at [dashboard.sendblue.com](https://dashboard.sendblue.com/company-signup)
2. Get your **API Key** and **API Secret** from Dashboard → API Keys
3. Note your assigned **phone number**

### 2. Install the Plugin

```bash
# Clone to clawdbot extensions directory
git clone https://github.com/njerschow/clawdbot-sendblue ~/.clawdbot/extensions/sendblue
cd ~/.clawdbot/extensions/sendblue
npm install
npm run build
```

### 3. Configure Clawdbot

Edit `~/.clawdbot/clawdbot.json`:

```json
{
  "channels": {
    "sendblue": {
      "apiKey": "sb-api-key-xxxxx",
      "apiSecret": "sb-secret-xxxxx",
      "phoneNumber": "+15551234567",
      "allowFrom": ["+15559876543", "+15551111111"],
      "pollIntervalMs": 5000,
      "dmPolicy": "allowlist"
    }
  }
}
```

Replace the values with your actual Sendblue credentials.

### 4. Restart Clawdbot

The plugin will automatically register the Sendblue channel on startup.

## Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `apiKey` | Yes | - | Sendblue API key |
| `apiSecret` | Yes | - | Sendblue API secret |
| `phoneNumber` | Yes | - | Your Sendblue phone number (E.164 format) |
| `allowFrom` | No | (all) | Array of phone numbers to accept messages from |
| `pollIntervalMs` | No | 5000 | How often to poll for new messages (ms) |
| `dmPolicy` | No | allowlist | `"allowlist"`, `"open"`, or `"disabled"` |

## DM Policy Options

- **allowlist**: Only accept messages from numbers in `allowFrom`
- **open**: Accept messages from any number
- **disabled**: Don't accept any inbound messages

## Architecture

```
User (iPhone)
     │
     ▼ iMessage/SMS
┌─────────────────┐
│  Sendblue API   │
└────────┬────────┘
         │ poll
         ▼
┌─────────────────────────────┐
│  Clawdbot Gateway           │
│  └── sendblue plugin        │
│      • Polls for messages   │
│      • Registers channel    │
│      • Routes to clawdbot   │
└─────────────────────────────┘
```

## Data Storage

Message deduplication data is stored in `~/.config/clawdbot-sendblue/adapter.db` (SQLite).

## License

MIT
