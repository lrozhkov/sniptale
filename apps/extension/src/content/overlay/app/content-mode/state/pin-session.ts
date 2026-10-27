import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../../application/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  attachContentActionIntent,
  type ContentPrivilegedActionIntentSource,
} from '../../../../application/privileged-action-intent';

type ContentPinToTabSessionWriteGuard = () => boolean;
type ContentPinToTabSessionWriteResult =
  | { pinToTabAvailable: boolean; status: 'acknowledged'; value: boolean }
  | { status: 'superseded' };
export type ContentPinToTabSessionState = {
  pinToTabAutomatic?: boolean;
  pinToTab: boolean;
  pinToTabAvailable: boolean;
  toolbarVisible: boolean;
};
type ContentPinToTabSessionMutation = {
  autoPinToTab?: boolean;
  pinToTab?: boolean;
  toolbarVisible?: boolean;
};

const logger = createLogger({ namespace: 'ContentPinToTabSessionState' });
let pinToTabWriteChain: Promise<void> = Promise.resolve();

function isExtensionContextInvalidatedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.includes('Extension context invalidated');
}

export function readContentPinToTabSessionState(): boolean {
  return false;
}

async function requestPinToTabSessionState(
  mutation: ContentPinToTabSessionMutation = {},
  contentIntentSource?: ContentPrivilegedActionIntentSource
): Promise<ContentPinToTabSessionState> {
  const baseMessage = { ...mutation, type: MessageType.CONTENT_RUNTIME_WAKEUP };
  const message =
    mutation.pinToTab === true || mutation.autoPinToTab === true
      ? await attachContentActionIntent(baseMessage, contentIntentSource)
      : baseMessage;
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage(message);
  if (
    !response?.success ||
    typeof response.pinToTab !== 'boolean' ||
    typeof response.pinToTabAvailable !== 'boolean' ||
    (response.pinToTabAutomatic !== undefined && typeof response.pinToTabAutomatic !== 'boolean')
  ) {
    throw new Error('Background pin-to-tab session owner returned an invalid response');
  }

  return {
    pinToTab: response.pinToTab,
    ...(response.pinToTabAutomatic ? { pinToTabAutomatic: true } : {}),
    pinToTabAvailable: response.pinToTabAvailable,
    toolbarVisible: typeof response.toolbarVisible === 'boolean' ? response.toolbarVisible : true,
  };
}

export async function loadContentPinToTabSessionState(): Promise<ContentPinToTabSessionState> {
  try {
    return await requestPinToTabSessionState();
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      logger.warn('Failed to load authoritative pin-to-tab session state', error);
    }
    return { pinToTab: false, pinToTabAvailable: false, toolbarVisible: true };
  }
}

function isCurrentWrite(): boolean {
  return true;
}

export function writeContentPinToTabSessionState(
  value: boolean,
  isCurrent: ContentPinToTabSessionWriteGuard = isCurrentWrite,
  contentIntentSource?: ContentPrivilegedActionIntentSource
): Promise<ContentPinToTabSessionWriteResult> {
  const writeOperation = pinToTabWriteChain
    .catch(() => undefined)
    .then(async () => {
      if (!isCurrent()) {
        return { status: 'superseded' } as const;
      }

      const state = await requestPinToTabSessionState({ pinToTab: value }, contentIntentSource);
      return {
        pinToTabAvailable: state.pinToTabAvailable,
        status: 'acknowledged',
        value: state.pinToTab,
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

export function writeContentPinToTabToolbarVisibilityState(
  value: boolean,
  contentIntentSource?: ContentPrivilegedActionIntentSource,
  onAccepted?: (state: ContentPinToTabSessionState) => void
): Promise<void> {
  const writeOperation = pinToTabWriteChain
    .catch(() => undefined)
    .then(async () => {
      const state = await requestPinToTabSessionState(
        {
          toolbarVisible: value,
          ...(!value && contentIntentSource ? { autoPinToTab: true } : {}),
        },
        contentIntentSource
      );
      onAccepted?.(state);
    });

  pinToTabWriteChain = writeOperation.then(
    () => undefined,
    () => undefined
  );

  return writeOperation.catch((error) => {
    logger.warn('Failed to persist pinned-toolbar visibility state', error);
    throw error;
  });
}
