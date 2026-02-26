import {
  createSendblueChannel,
  startSendblueService,
  stopSendblueService
} from './channel.js';

import {
  createClawdtalkChannel
} from './clawdtalk-channel.js';

import {
  startClawdTalkWebhook,
  stopClawdTalkWebhook
} from './clawdtalk-webhook.js';

/**
 * Plugin entry point
 */
export default function register(api: any) {
  const log = api.logger || console;
  const config = api.pluginConfig;

  if (!config) {
    log.warn('[Multichannel Plugin] No config provided');
    return;
  }

  /*
   * -------------------------
   * SENDBLUE REGISTRATION
   * -------------------------
   */
  if (config.sendblue) {
    log.info('[Multichannel Plugin] Registering Sendblue channel...');

    const sendblueChannel = createSendblueChannel(api);
    api.registerChannel({ plugin: sendblueChannel });

    api.registerService({
      id: 'sendblue-service',
      start: () => {
        log.info('[Sendblue Service] Starting...');
        startSendblueService(api, config.sendblue);
      },
      stop: () => {
        log.info('[Sendblue Service] Stopping...');
        stopSendblueService();
      },
    });

    log.info('[Multichannel Plugin] Sendblue registered');
  }

  /*
   * -------------------------
   * CLAWDTALK REGISTRATION
   * -------------------------
   */
  if (config.clawdtalk) {
    log.info('[Multichannel Plugin] Registering ClawdTalk channel...');

    const clawdtalkChannel = createClawdtalkChannel(api);
    api.registerChannel({ plugin: clawdtalkChannel });

    api.registerService({
      id: 'clawdtalk-service',
      start: () => {
        log.info('[ClawdTalk Service] Starting...');
        startClawdTalkWebhook(clawdtalkChannel, config.clawdtalk);
      },
      stop: () => {
        log.info('[ClawdTalk Service] Stopping...');
        stopClawdTalkWebhook();
      },
    });

    log.info('[Multichannel Plugin] ClawdTalk registered');
  }

  log.info('[Multichannel Plugin] Initialization complete');
}