/**
 * Clawdbot Sendblue Plugin
 *
 * Registers a Sendblue messaging channel for iMessage/SMS support.
 */

import { createSendblueChannel, startSendblueService, stopSendblueService } from './channel.js';

/**
 * Plugin entry point
 * Called by clawdbot to register the plugin
 */
export default function register(api: any) {
  const log = api.logger || console;

  // Debug: log available API methods
  const keys = Object.keys(api);
  log.info(`[Sendblue Plugin] API has ${keys.length} methods: ${keys.join(', ')}`);

  // Explore runtime.channel - this is likely how we dispatch inbound messages
  if (api.runtime?.channel) {
    const channelKeys = Object.keys(api.runtime.channel);
    log.info(`[Sendblue Plugin] runtime.channel has: ${channelKeys.join(', ')}`);

    // Log types of each method
    for (const key of channelKeys) {
      log.info(`[Sendblue Plugin]   channel.${key}: ${typeof api.runtime.channel[key]}`);
    }
  }

  // Check pluginConfig
  if (api.pluginConfig) {
    log.info(`[Sendblue Plugin] pluginConfig keys: ${Object.keys(api.pluginConfig).join(', ')}`);
  }

  log.info('[Sendblue Plugin] Registering channel...');

  const channel = createSendblueChannel(api);
  api.registerChannel({ plugin: channel });

  log.info('[Sendblue Plugin] Channel registered');

  // Register service to handle polling lifecycle
  api.registerService({
    id: 'sendblue-poller',
    start: () => {
      log.info('[Sendblue Plugin] Service starting...');
      const config = api.config?.plugins?.entries?.sendblue?.config;
      if (config) {
        startSendblueService(api, config);
      } else {
        log.warn('[Sendblue Plugin] No config found, service not started');
      }
    },
    stop: () => {
      log.info('[Sendblue Plugin] Service stopping...');
      stopSendblueService();
    },
  });

  log.info('[Sendblue Plugin] Service registered');
}
