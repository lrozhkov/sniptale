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
import {
  ensureActivePageAccessRuntime,
  hasActivePageAccess,
  registerPinnedToolbarAllSitesAccess,
  requestPinnedToolbarAllSitesPermission,
} from './service';
import {
  beginPinnedToolbarOperation,
  observePinnedToolbarOperations,
} from './pinned-toolbar-operation';
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

type UserPinnedState = {
  isCurrent: () => boolean;
  userPinned: boolean;
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
  senderBinding: ContentSenderBinding;
}): Promise<UserPinnedState> {
  const tabId = args.senderBinding.tabId;
  const requestedPinState = args.message.pinToTab;
  if (requestedPinState === undefined) {
    const operation = observePinnedToolbarOperations(tabId);
    return {
      isCurrent: operation.isCurrent,
      userPinned: await operation.runExclusive(() => readPinToTabSessionStorageState(tabId)),
    };
  }

  const operation = beginPinnedToolbarOperation(tabId);
  const screenshotModeEnabled = args.runtimeState.screenshotModeState.get(tabId) === true;
  const storageScope = {
    screenshotModeEnabled,
    storageKey: createPinToTabSessionStorageKey(tabId),
  };
  let permissionResult: { error?: unknown; granted: boolean } | null = null;

  if (requestedPinState && screenshotModeEnabled) {
    try {
      permissionResult = {
        granted: await requestPinnedToolbarAllSitesPermission(),
      };
    } catch (error) {
      permissionResult = { error, granted: false };
    }
  }

  const userPinned = await operation.runExclusive(async () => {
    if (!operation.isCurrent()) {
      return readPinToTabSessionStorageState(tabId);
    }

    if (!requestedPinState || !screenshotModeEnabled) {
      await writePinToTabSessionStorageState(storageScope, requestedPinState, operation.isCurrent);
      return readPinToTabSessionStorageState(tabId);
    }

    if (permissionResult?.error !== undefined) {
      await writePinToTabSessionStorageState(storageScope, false, operation.isCurrent);
      throw permissionResult.error;
    }

    if (permissionResult?.granted !== true) {
      await writePinToTabSessionStorageState(storageScope, false, operation.isCurrent);
      return readPinToTabSessionStorageState(tabId);
    }

    let registration: 'registered' | 'superseded';
    try {
      registration = await registerPinnedToolbarAllSitesAccess({
        commit: async () => {
          if (!operation.isCurrent()) {
            return false;
          }

          const previousPinState = await readPinToTabSessionStorageState(tabId);
          if (!operation.isCurrent()) {
            return false;
          }

          await writePinToTabSessionStorageState(storageScope, true, operation.isCurrent);
          if (operation.isCurrent()) {
            return true;
          }

          await writePinToTabSessionStorageState(storageScope, previousPinState, () => true);
          return false;
        },
        expectedUrl: args.senderBinding.senderUrl,
        isCurrent: operation.isCurrent,
        tabId,
      });
    } catch (error) {
      await writePinToTabSessionStorageState(storageScope, false, operation.isCurrent);
      throw error;
    }
    if (registration !== 'registered' || !operation.isCurrent()) {
      return readPinToTabSessionStorageState(tabId);
    }
    return readPinToTabSessionStorageState(tabId);
  });

  return { isCurrent: operation.isCurrent, userPinned };
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

async function createSupersededWakeupResponse(
  tabId: number
): Promise<ContentRuntimeWakeupResponse> {
  return {
    pinToTab: await readPinToTabSessionStorageState(tabId),
    restored: false,
    success: true,
  };
}

async function restoreRuntimeForWakeup(args: {
  isCurrent: () => boolean;
  runtimeState: BackgroundRuntimeMessageDeps;
  scenarioState: ScenarioRestoreState;
  tabId: number;
  userPinned: boolean;
}): Promise<boolean> {
  if (!(await hasActivePageAccess(args.tabId)) || !args.isCurrent()) {
    return false;
  }

  await restoreForcedScenarioSurface({
    runtimeState: args.runtimeState,
    scenarioState: args.scenarioState,
    tabId: args.tabId,
  });
  if (!args.isCurrent()) {
    return false;
  }

  await ensureActivePageAccessRuntime(args.tabId);
  if (!args.isCurrent()) {
    return false;
  }

  if (args.userPinned || args.scenarioState.shouldEnablePreparation) {
    await enablePreparationForWakeup(args.tabId, args.runtimeState);
  }
  return args.isCurrent();
}

async function handleContentRuntimeWakeup(args: {
  message: ContentRuntimeWakeupMessage;
  runtimeState: BackgroundRuntimeMessageDeps;
  senderBinding: ContentSenderBinding;
}): Promise<ContentRuntimeWakeupResponse> {
  const tabId = args.senderBinding.tabId;
  const [userPinState, scenarioState] = await Promise.all([
    synchronizeUserPinnedState({
      message: args.message,
      runtimeState: args.runtimeState,
      senderBinding: args.senderBinding,
    }),
    readScenarioRestoreState(tabId, args.runtimeState),
  ]);
  const userPinned = userPinState.userPinned;

  if (!userPinState.isCurrent()) {
    return createSupersededWakeupResponse(tabId);
  }

  if (!userPinned && !scenarioState.shouldRestore) {
    return { pinToTab: false, restored: false, success: true };
  }

  const restored = await restoreRuntimeForWakeup({
    isCurrent: userPinState.isCurrent,
    runtimeState: args.runtimeState,
    scenarioState,
    tabId,
    userPinned,
  });
  if (!userPinState.isCurrent()) {
    return createSupersededWakeupResponse(tabId);
  }

  if (!restored) {
    return { pinToTab: userPinned, restored: false, success: true };
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
