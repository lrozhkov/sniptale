import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

type ContentPinToTabSessionWriteGuard = () => boolean;
type ContentPinToTabSessionWriteResult =
  | { status: 'acknowledged'; value: boolean }
  | { status: 'superseded' };

const logger = createLogger({ namespace: 'ContentPinToTabSessionState' });
let pinToTabWriteChain: Promise<void> = Promise.resolve();

export function readContentPinToTabSessionState(): boolean {
  return false;
}

async function requestPinToTabSessionState(pinToTab?: boolean): Promise<boolean> {
  const message =
    pinToTab === undefined
      ? { type: MessageType.CONTENT_RUNTIME_WAKEUP }
      : { pinToTab, type: MessageType.CONTENT_RUNTIME_WAKEUP };
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage(message);
  if (!response?.success || typeof response.pinToTab !== 'boolean') {
    throw new Error('Background pin-to-tab session owner returned an invalid response');
  }

  return response.pinToTab;
}

export async function loadContentPinToTabSessionState(): Promise<boolean> {
  try {
    return await requestPinToTabSessionState();
  } catch (error) {
    logger.warn('Failed to load authoritative pin-to-tab session state', error);
    return false;
  }
}

function isCurrentWrite(): boolean {
  return true;
}

export function writeContentPinToTabSessionState(
  value: boolean,
  isCurrent: ContentPinToTabSessionWriteGuard = isCurrentWrite
): Promise<ContentPinToTabSessionWriteResult> {
  const writeOperation = pinToTabWriteChain
    .catch(() => undefined)
    .then(async () => {
      if (!isCurrent()) {
        return { status: 'superseded' } as const;
      }

      return {
        status: 'acknowledged',
        value: await requestPinToTabSessionState(value),
      } as const;
    });

  pinToTabWriteChain = writeOperation.then(
    () => undefined,
    () => undefined
  );

  return writeOperation.catch((error) => {
    if (isCurrent()) {
      logger.warn('Failed to persist authoritative pin-to-tab session state', error);
    }
    throw error;
  });
}
