import { createLogger } from '@sniptale/platform/observability/logger';
import { initTracer } from '@sniptale/platform/observability/message-tracer';
import { sendRuntimeMessage } from '../../platform/runtime-messaging/index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const logger = createLogger({ namespace: 'OffscreenDocument' });
let currentStartupId: string | null = null;

/** Publish transport readiness only after both runtime listeners have been registered. */
export function bootstrapOffscreenDocument(): void {
  initTracer('off');
  try {
    currentStartupId = new URL(globalThis.location.href).searchParams.get('offscreenStartupId');
  } catch {
    currentStartupId = null;
  }
  if (!currentStartupId) {
    logger.warn('Offscreen startup identity unavailable');
    return;
  }
  logger.debug('Offscreen transport ready');
  void sendRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_READY,
    offscreenStartupId: currentStartupId,
  }).catch(() => logger.warn('Failed to notify runtime about offscreen readiness'));
}

/** Verify the live transport without admitting storage or waiting for recovery. */
export async function probeOffscreenRuntimeReadiness(args: {
  challenge: string;
  offscreenStartupId: string;
}): Promise<{ challenge: string; offscreenStartupId: string; state: 'failed' | 'ready' }> {
  return {
    challenge: args.challenge,
    offscreenStartupId: currentStartupId ?? 'missing-offscreen-startup-id',
    state:
      currentStartupId !== null && currentStartupId === args.offscreenStartupId
        ? 'ready'
        : 'failed',
  };
}
