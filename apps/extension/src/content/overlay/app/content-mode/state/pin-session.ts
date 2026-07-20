import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createPinToTabSessionStorageKey,
  isPinToTabSessionStorageAccessDeniedError,
  isPinToTabSessionStorageAvailable,
  loadPinToTabSessionStorageState,
  type ContentPinToTabSessionWriteGuard,
  type PinToTabSessionScope,
  writePinToTabSessionStorageState,
} from '../../../../../composition/persistence/content-pin-session/index';

const logger = createLogger({ namespace: 'ContentPinToTabSessionState' });
let pinToTabWriteChain: Promise<void> = Promise.resolve();

export function readContentPinToTabSessionState(): boolean {
  return false;
}

async function resolvePinToTabSessionScope(): Promise<PinToTabSessionScope | null> {
  try {
    const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
      type: MessageType.SCREENSHOT_MODE_STATUS,
    });
    if (!response?.success || typeof response.tabId !== 'number' || response.tabId < 0) {
      return null;
    }

    return {
      screenshotModeEnabled: response.enabled === true,
      storageKey: createPinToTabSessionStorageKey(response.tabId),
    };
  } catch (error) {
    logger.warn('Failed to resolve pin-to-tab session scope', error);
    return null;
  }
}

export async function loadContentPinToTabSessionState(): Promise<boolean> {
  if (isPinToTabSessionStorageAvailable()) {
    try {
      const scope = await resolvePinToTabSessionScope();
      if (!scope) {
        return false;
      }
      if (!scope.screenshotModeEnabled) {
        return false;
      }

      return await loadPinToTabSessionStorageState(scope);
    } catch (error) {
      if (isPinToTabSessionStorageAccessDeniedError(error)) {
        return false;
      }

      logger.warn('Failed to load authoritative pin-to-tab session state', error);
      return false;
    }
  }

  return false;
}

function isCurrentWrite(): boolean {
  return true;
}

export function writeContentPinToTabSessionState(
  value: boolean,
  isCurrent: ContentPinToTabSessionWriteGuard = isCurrentWrite
): void {
  if (isPinToTabSessionStorageAvailable()) {
    const writeOperation = pinToTabWriteChain
      .catch(() => undefined)
      .then(() => writeBrowserSessionState(value, isCurrent));

    pinToTabWriteChain = writeOperation.then(
      () => undefined,
      () => undefined
    );

    void writeOperation.catch((error) => {
      if (isPinToTabSessionStorageAccessDeniedError(error)) {
        return;
      }

      logger.warn('Failed to persist authoritative pin-to-tab session state', error);
    });
    return;
  }
}

async function writeBrowserSessionState(
  value: boolean,
  isCurrent: ContentPinToTabSessionWriteGuard
): Promise<void> {
  if (!isPinToTabSessionStorageAvailable()) {
    return;
  }

  const scope = await resolvePinToTabSessionScope();
  if (!scope) {
    return;
  }
  await writePinToTabSessionStorageState(scope, value, isCurrent);
}
