import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentQuickEditMode' });

export function createQuickEditEnableGuards(props: { getIsQuickEditMode: () => boolean }) {
  function startEnableFlow(): boolean {
    if (props.getIsQuickEditMode()) {
      logger.debug('Quick edit mode already enabled');
      return false;
    }

    logger.log('Enabling quick edit mode');
    return true;
  }

  function startDisableFlow(): boolean {
    if (!props.getIsQuickEditMode()) {
      logger.debug('Quick edit mode already disabled');
      return false;
    }

    logger.log('Disabling quick edit mode');
    return true;
  }

  return { startDisableFlow, startEnableFlow };
}

export function createQuickEditModeHandlers(props: {
  cleanupModeResources: () => void;
  disableDocumentMode: () => void;
  disableEditingSessions: () => void;
  disableMode: () => boolean;
  enableMode: () => boolean;
  enableModeListeners: () => number;
  setIsQuickEditMode: (value: boolean) => void;
}) {
  function enable(): void {
    if (!props.enableMode()) {
      return;
    }

    try {
      const iframeCount = props.enableModeListeners();
      props.setIsQuickEditMode(true);
      logger.debug('Quick edit mode listeners attached', { iframeCount });
    } catch (error) {
      props.cleanupModeResources();
      logger.error('Failed to enable quick edit mode', error);
      throw error;
    }
  }

  function disable(): void {
    if (!props.disableMode()) {
      return;
    }

    try {
      props.disableDocumentMode();
      props.disableEditingSessions();
      props.cleanupModeResources();
      props.setIsQuickEditMode(false);
      logger.debug('Quick edit mode resources cleaned up');
    } catch (error) {
      logger.error('Failed to disable quick edit mode', error);
      throw error;
    }
  }

  return { disable, enable };
}
