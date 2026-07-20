import { createLogger } from '@sniptale/platform/observability/logger';
import {
  disableQuickEditDocumentMode,
  enableQuickEditDocumentMode,
  isQuickEditDocumentModeEnabled,
} from '../../../selection/quick-edit';
import type { UseToolbarModeControllerParams } from './types';

const logger = createLogger({ namespace: 'ContentToolbarModeDocumentMode' });

function syncQuickEditDocumentModeState(
  setQuickEditDocumentMode: (enabled: boolean) => void
): void {
  setQuickEditDocumentMode(isQuickEditDocumentModeEnabled());
}

export function resetQuickEditDocumentMode(
  setQuickEditDocumentMode: (enabled: boolean) => void
): boolean {
  try {
    disableQuickEditDocumentMode();
  } catch (error) {
    logger.error('Failed to disable quick edit document mode', error);
    syncQuickEditDocumentModeState(setQuickEditDocumentMode);
    return false;
  }

  setQuickEditDocumentMode(false);
  return true;
}

export function createQuickEditDocumentModeToggle({
  setQuickEditDocumentMode,
}: Pick<UseToolbarModeControllerParams, 'setQuickEditDocumentMode'>) {
  return (enabled: boolean) => {
    try {
      if (enabled) {
        enableQuickEditDocumentMode();
        syncQuickEditDocumentModeState(setQuickEditDocumentMode);
        return;
      }

      disableQuickEditDocumentMode();
      syncQuickEditDocumentModeState(setQuickEditDocumentMode);
    } catch (error) {
      logger.error('Failed to toggle quick edit document mode', error);
      syncQuickEditDocumentModeState(setQuickEditDocumentMode);
    }
  };
}
