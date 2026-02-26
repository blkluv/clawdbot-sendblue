import http from 'http';

export function startClawdTalkWebhook(clawdtalkChannel: any) {

  const server = http.createServer(async (req, res) => {

    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {

      try {
        const payload = JSON.parse(body);

        await clawdtalkChannel.handleInbound({
          sessionId: payload.sessionId,
          transcript: payload.text,
          callerId: payload.callerId,
          timestamp: Date.now()
        });

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));

      } catch (err) {
        res.writeHead(400);
        res.end();
      }
    });
  });

  server.listen(3200, () => {
    console.log('[ClawdTalk] Webhook listening on port 3200');
  });
}