import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createPinToTabSessionStorageKey,
  readPinToTabSessionStorageState,
  writePinToTabSessionStorageState,
} from '../../../composition/persistence/content-pin-session/index';
import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ContentSenderBinding } from '../../routing-contracts/capabilities/content-action/capability-store';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';
import { respondAsyncRoute } from '../../routing-contracts/response';
import { ensureActivePageAccessRuntime, hasActivePageAccess } from './service';
import { enableScreenshotMode } from '../tab-mode-router-screenshot';
import { runtimeActionCoreMessageContracts } from '../../../contracts/messaging/contracts/runtime/actions/core';

type ContentRuntimeWakeupResponse = {
  error?: string;
  pinToTab?: boolean;
  reason?: 'pin-to-tab' | 'scenario';
  restored?: boolean;
  success: boolean;
};

type ContentRuntimeWakeupMessage = {
  pinToTab?: boolean;
  type: typeof MessageType.CONTENT_RUNTIME_WAKEUP;
};

type ScenarioRestoreState = {
  shouldEnablePreparation: boolean;
  shouldRestore: boolean;
  shouldWriteForcedScenarioSurface: boolean;
  surface: ScenarioRecorderSurfaceState;
};

function parseContentRuntimeWakeupMessage(message: unknown): ContentRuntimeWakeupMessage | null {
  try {
    return runtimeActionCoreMessageContracts[MessageType.CONTENT_RUNTIME_WAKEUP].parseRequest(
      message
    );
  } catch {
    return null;
  }
}

async function synchronizeUserPinnedState(args: {
  message: ContentRuntimeWakeupMessage;
  runtimeState: BackgroundRuntimeMessageDeps;
  tabId: number;
}): Promise<boolean> {
  if (args.message.pinToTab !== undefined) {
    await writePinToTabSessionStorageState(
      {
        screenshotModeEnabled: args.runtimeState.screenshotModeState.get(args.tabId) === true,
        storageKey: createPinToTabSessionStorageKey(args.tabId),
      },
      args.message.pinToTab,
      () => true
    );
  }

  return readPinToTabSessionStorageState(args.tabId);
}

function shouldScenarioSurfaceRestore(surface: ScenarioRecorderSurfaceState): boolean {
  return surface.captureAction === 'scenario' || surface.screenshotMode || surface.toolbarVisible;
}

async function readScenarioRestoreState(
  tabId: number,
  runtimeState: BackgroundRuntimeMessageDeps
): Promise<ScenarioRestoreState> {
  const [session, surface] = await Promise.all([
    runtimeState.scenarioSessionService.getSession(tabId),
    runtimeState.scenarioSessionService.getSurface(tabId),
  ]);
  const shouldRestore = session.enabled || shouldScenarioSurfaceRestore(surface);
  return {
    shouldEnablePreparation: session.enabled || shouldScenarioSurfaceRestore(surface),
    shouldRestore,
    shouldWriteForcedScenarioSurface:
      session.enabled &&
      (surface.captureAction !== 'scenario' || !surface.screenshotMode || !surface.toolbarVisible),
    surface,
  };
}

async function restoreForcedScenarioSurface(args: {
  scenarioState: ScenarioRestoreState;
  tabId: number;
  runtimeState: BackgroundRuntimeMessageDeps;
}): Promise<void> {
  if (!args.scenarioState.shouldWriteForcedScenarioSurface) {
    return;
  }

  await args.runtimeState.scenarioSessionService.updateSurfaceState(args.tabId, {
    ...args.scenarioState.surface,
    captureAction: 'scenario',
    screenshotMode: true,
    toolbarVisible: true,
  });
}

async function enablePreparationForWakeup(
  tabId: number,
  runtimeState: BackgroundRuntimeMessageDeps
): Promise<void> {
  await enableScreenshotMode(
    tabId,
    runtimeState.screenshotModeState,
    runtimeState.viewportState,
    runtimeState.viewportOwnerState,
    runtimeState.webSnapshotViewerPorts
  );
}

async function handleContentRuntimeWakeup(args: {
  message: ContentRuntimeWakeupMessage;
  runtimeState: BackgroundRuntimeMessageDeps;
  senderBinding: ContentSenderBinding;
}): Promise<ContentRuntimeWakeupResponse> {
  const tabId = args.senderBinding.tabId;
  const [userPinned, scenarioState] = await Promise.all([
    synchronizeUserPinnedState({
      message: args.message,
      runtimeState: args.runtimeState,
      tabId,
    }),
    readScenarioRestoreState(tabId, args.runtimeState),
  ]);

  if (!userPinned && !scenarioState.shouldRestore) {
    return { pinToTab: false, restored: false, success: true };
  }

  if (!(await hasActivePageAccess(tabId))) {
    return { pinToTab: userPinned, restored: false, success: true };
  }

  await restoreForcedScenarioSurface({
    runtimeState: args.runtimeState,
    scenarioState,
    tabId,
  });

  await ensureActivePageAccessRuntime(tabId);

  if (userPinned || scenarioState.shouldEnablePreparation) {
    await enablePreparationForWakeup(tabId, args.runtimeState);
  }

  return {
    pinToTab: userPinned,
    reason: userPinned ? 'pin-to-tab' : 'scenario',
    restored: true,
    success: true,
  };
}

export function routeContentRuntimeWakeupMessage(args: {
  message: unknown;
  runtimeState: BackgroundRuntimeMessageDeps;
  senderBinding: ContentSenderBinding | null;
  sendResponse: ResponseSender<ContentRuntimeWakeupResponse>;
}): boolean {
  const message = parseContentRuntimeWakeupMessage(args.message);
  if (!message) {
    return false;
  }

  if (!args.senderBinding) {
    args.sendResponse({
      pinToTab: false,
      restored: false,
      success: false,
    });
    return true;
  }

  respondAsyncRoute(
    handleContentRuntimeWakeup({
      message,
      runtimeState: args.runtimeState,
      senderBinding: args.senderBinding,
    }),
    args.sendResponse
  );
  return true;
}
