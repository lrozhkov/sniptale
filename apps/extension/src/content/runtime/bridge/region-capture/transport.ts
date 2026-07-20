import { runBestEffort } from '@sniptale/foundation/best-effort';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import type { CaptureProgress } from '../../../selection/region-capture/types';

type RegionCaptureRuntimeMessage =
  | { type: 'REGION_CAPTURE_STARTED' }
  | { type: 'REGION_CAPTURE_ERROR'; error: string };

export type RegionCaptureRuntimeTransport = {
  sendRuntimeMessage(message: RegionCaptureRuntimeMessage): Promise<unknown>;
};

const defaultRegionCaptureTransport: RegionCaptureRuntimeTransport = {
  sendRuntimeMessage: (message) =>
    getContentRuntimeServices().messaging.sendRuntimeMessage(message),
};
const logger = createLogger({ namespace: 'ContentRegionCaptureTransport' });

function fireAndForgetRuntimeMessage(
  transport: RegionCaptureRuntimeTransport,
  message: RegionCaptureRuntimeMessage
): void {
  runBestEffort(
    transport.sendRuntimeMessage(message),
    logger,
    'Failed to forward region capture progress update',
    { type: message.type }
  );
}

/**
 * Creates the runtime transport bridge that forwards Region Capture lifecycle updates.
 */
export function createRegionCaptureProgressReporter(
  transport: RegionCaptureRuntimeTransport = defaultRegionCaptureTransport
): (progress: CaptureProgress) => void {
  return (progress) => {
    if (progress.type === 'ERROR') {
      fireAndForgetRuntimeMessage(transport, {
        type: 'REGION_CAPTURE_ERROR',
        error: progress.error ?? 'Unknown region capture error',
      });
      return;
    }

    if (progress.type === 'STARTED') {
      fireAndForgetRuntimeMessage(transport, { type: 'REGION_CAPTURE_STARTED' });
    }
  };
}
