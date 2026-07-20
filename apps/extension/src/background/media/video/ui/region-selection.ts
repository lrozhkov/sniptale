import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  RegionSelectedMessage,
  RegionSelectionCancelledMessage,
} from '../../../../contracts/video/types/messages';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { parseRuntimeRequestMessage } from '../../../../contracts/messaging/parsers/boundary';
import type { Logger } from '@sniptale/platform/observability/logger/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { RuntimeMessagingTransport } from '../../../../platform/runtime-messaging/transport';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

import { runRequestWorkflow } from './request-workflow';
import {
  createRegionSelectionRequestBinding,
  isRegionSelectionResultForRequest,
  isRegionSelectionSenderForRequest,
  type RegionSelectionRequestBinding,
  toShowRegionSelectorMessage,
} from './region-selection.request-binding';
import { type RecordingRegion, showRecordingOverlay } from './shared';

type RegionSelectionMessage = RegionSelectedMessage | RegionSelectionCancelledMessage;

type VideoManagerUiLogger = Pick<Logger, 'debug' | 'error' | 'log' | 'warn'>;
type MessageSubscription = typeof browserRuntime.subscribeToMessages;

type RegionSelectionRequestDeps = {
  createRequestBinding?: typeof createRegionSelectionRequestBinding;
  logger: VideoManagerUiLogger;
  sendTabMessage: RuntimeMessagingTransport['sendTabMessage'];
  showRecordingOverlay: typeof showRecordingOverlay;
  subscribeToMessages: MessageSubscription;
};

const defaultRegionSelectionRequestDeps: RegionSelectionRequestDeps = {
  createRequestBinding: createRegionSelectionRequestBinding,
  logger: createLogger({ namespace: 'BackgroundVideoUi:RegionSelection' }),
  sendTabMessage: (tabId, message) =>
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, message),
  showRecordingOverlay,
  subscribeToMessages: browserRuntime.subscribeToMessages,
};

const activeRegionSelectionRequests = new Map<
  number,
  { binding: RegionSelectionRequestBinding; cancel: () => void; owner: symbol }
>();
const latestRegionSelectionRequestOwners = new Map<number, symbol>();

function parseRegionSelectionMessage(message: unknown): RegionSelectionMessage | null {
  try {
    const parsedMessage = parseRuntimeRequestMessage(message);
    if (
      parsedMessage.type === VideoMessageType.REGION_SELECTED ||
      parsedMessage.type === VideoMessageType.REGION_SELECTION_CANCELLED
    ) {
      return parsedMessage;
    }
  } catch {
    return null;
  }

  return null;
}

function clearActiveRegionSelectionRequest(tabId: number, owner: symbol): void {
  if (activeRegionSelectionRequests.get(tabId)?.owner === owner) {
    activeRegionSelectionRequests.delete(tabId);
  }
  if (latestRegionSelectionRequestOwners.get(tabId) === owner) {
    latestRegionSelectionRequestOwners.delete(tabId);
  }
}

function isActiveRegionSelectionRequest(binding: RegionSelectionRequestBinding): boolean {
  return activeRegionSelectionRequests.get(binding.tabId)?.binding === binding;
}

function isLatestRegionSelectionOwner(tabId: number, owner: symbol): boolean {
  return latestRegionSelectionRequestOwners.get(tabId) === owner;
}

function cancelActiveRegionSelectionRequest(tabId: number): boolean {
  const activeRequest = activeRegionSelectionRequests.get(tabId);
  if (!activeRequest) {
    return false;
  }

  activeRequest.cancel();
  return true;
}

export function handleRegionSelectionNavigationStart(tabId: number): boolean {
  return cancelActiveRegionSelectionRequest(tabId);
}

function isRegionSelectionResponseAccepted(
  parsedMessage: RegionSelectionMessage,
  sender: chrome.runtime.MessageSender,
  binding: RegionSelectionRequestBinding
): boolean {
  return (
    isRegionSelectionResultForRequest(parsedMessage, binding) &&
    isRegionSelectionSenderForRequest(sender, binding)
  );
}

function showSelectedRegionThenFinish(props: {
  finish: (region: RecordingRegion | null) => void;
  logger: VideoManagerUiLogger;
  message: RegionSelectedMessage;
  showRecordingOverlay: typeof showRecordingOverlay;
  tabId: number;
}): void {
  props
    .showRecordingOverlay(props.tabId, props.message.region)
    .catch((error) => props.logger.warn('[VideoManager] Failed to show recording overlay:', error))
    .finally(() => props.finish(props.message.region));
}

function handleAcceptedRegionSelectionMessage(props: {
  finish: (region: RecordingRegion | null) => void;
  logger: VideoManagerUiLogger;
  message: RegionSelectionMessage;
  showRecordingOverlay: typeof showRecordingOverlay;
  tabId: number;
}): void {
  if (props.message.type === VideoMessageType.REGION_SELECTED) {
    showSelectedRegionThenFinish({ ...props, message: props.message });
    return;
  }

  props.logger.debug('Region selection cancelled by user');
  props.finish(null);
}

function createRegionSelectionListener(props: {
  finish: (region: RecordingRegion | null) => void;
  binding: RegionSelectionRequestBinding;
  logger: VideoManagerUiLogger;
  owner: symbol;
  showRecordingOverlay: typeof showRecordingOverlay;
  tabId: number;
}) {
  let consumed = false;
  const finishAndClear = (region: RecordingRegion | null) => {
    clearActiveRegionSelectionRequest(props.tabId, props.owner);
    props.finish(region);
  };
  activeRegionSelectionRequests.set(props.tabId, {
    binding: props.binding,
    cancel: () => finishAndClear(null),
    owner: props.owner,
  });

  return (message: unknown, sender: chrome.runtime.MessageSender) => {
    const parsedMessage = parseRegionSelectionMessage(message);
    if (
      !parsedMessage ||
      !isActiveRegionSelectionRequest(props.binding) ||
      !isRegionSelectionResponseAccepted(parsedMessage, sender, props.binding)
    ) {
      return;
    }

    if (consumed) {
      return;
    }
    consumed = true;
    clearActiveRegionSelectionRequest(props.tabId, props.owner);

    handleAcceptedRegionSelectionMessage({
      finish: props.finish,
      logger: props.logger,
      message: parsedMessage,
      showRecordingOverlay: props.showRecordingOverlay,
      tabId: props.tabId,
    });
  };
}

/**
 * Requests a crop region from the target tab and restores the recording overlay on success.
 */
export function requestRegionSelection(
  tabId: number,
  deps: RegionSelectionRequestDeps = defaultRegionSelectionRequestDeps
): Promise<RecordingRegion | null> {
  const createRequestBinding = deps.createRequestBinding ?? createRegionSelectionRequestBinding;
  const owner = Symbol('region-selection-request');
  latestRegionSelectionRequestOwners.set(tabId, owner);
  cancelActiveRegionSelectionRequest(tabId);

  return createRequestBinding(tabId).then((binding) => {
    if (!isLatestRegionSelectionOwner(tabId, owner)) {
      return null;
    }

    return runRequestWorkflow({
      createListener: (finish) =>
        createRegionSelectionListener({
          finish,
          binding,
          logger: deps.logger,
          owner,
          showRecordingOverlay: deps.showRecordingOverlay,
          tabId,
        }),
      onRequestError: (error, finish) => {
        clearActiveRegionSelectionRequest(tabId, owner);
        deps.logger.error('[VideoManager] Failed to show region selector:', error);
        finish(null);
      },
      onTimeout: (finish) => {
        clearActiveRegionSelectionRequest(tabId, owner);
        deps.logger.warn('[VideoManager] Region selection timeout');
        finish(null);
      },
      request: () => deps.sendTabMessage(tabId, toShowRegionSelectorMessage(binding)),
      subscribeToMessages: deps.subscribeToMessages,
      timeoutMs: 60000,
    });
  });
}
