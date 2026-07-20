import { useEffect } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const logger = createLogger({ namespace: 'ContentToolbarShell' });

export function useToolbarViewportStatus(params: {
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
}) {
  const { setCurrentViewport } = params;

  useEffect(() => {
    const checkViewportStatus = async () => {
      try {
        const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
          type: MessageType.SCREENSHOT_MODE_STATUS,
        });
        setCurrentViewport(response?.success ? (response.viewport ?? null) : null);
      } catch (error) {
        logger.error('Failed to check screenshot mode status', error);
      }
    };

    void checkViewportStatus();
  }, [setCurrentViewport]);
}
