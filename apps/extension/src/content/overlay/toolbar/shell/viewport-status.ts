import { useEffect } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createScreenshotSurfaceStatusBindingUpdater } from '../../viewport-selector/capability';

const logger = createLogger({ namespace: 'ContentToolbarShell' });

export function useToolbarViewportStatus(params: {
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
}) {
  const { setCurrentViewport } = params;

  useEffect(() => {
    let disposed = false;
    const checkViewportStatus = async () => {
      const updateBinding = createScreenshotSurfaceStatusBindingUpdater();
      try {
        const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
          type: MessageType.SCREENSHOT_MODE_STATUS,
        });
        if (disposed) return;
        if (response?.success) {
          const applied = updateBinding({
            token: response.enabled ? (response.surfaceCapabilityToken ?? null) : null,
            ...(response.surfaceLeaseGeneration === undefined
              ? {}
              : { leaseGeneration: response.surfaceLeaseGeneration }),
            ...(response.surfaceOperationGeneration === undefined
              ? {}
              : { operationGeneration: response.surfaceOperationGeneration }),
          });
          if (!applied) return;
        }
        setCurrentViewport(response?.success ? (response.viewport ?? null) : null);
      } catch (error) {
        logger.error('Failed to check screenshot mode status', error);
      }
    };

    void checkViewportStatus();
    return () => {
      disposed = true;
    };
  }, [setCurrentViewport]);
}
