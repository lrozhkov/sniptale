import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import {
  readPinToTabSessionStorageState,
  readPinToTabToolbarVisibilitySessionStorageState,
  writePinToTabSessionStorageState,
} from '../../../composition/persistence/content-pin-session/index';
import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ContentSenderBinding } from '../../routing-contracts/capabilities/content-action/capability-store';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';
import { respondAsyncRoute } from '../../routing-contracts/response';
import {
  ensureActivePageAccessRuntime,
  hasActivePageAccess,
  hasPinnedToolbarAllSitesAccess,
  registerPinnedToolbarAllSitesAccess,
} from './service';
import {
  beginPinnedToolbarDurableOperation,
  beginPinnedToolbarOperation,
  observePinnedToolbarOperations,
} from './pinned-toolbar-operation';
import { enableScreenshotMode, enableScreenshotModeGuarded } from '../tab-mode-router-screenshot';
import { runtimeActionCoreMessageContracts } from '../../../contracts/messaging/contracts/runtime/actions/core';
import { waitForContentToolbarReady } from './readiness';

type ContentRuntimeWakeupResponse = {
  error?: string;
  pinToTab?: boolean;
  pinToTabAvailable?: boolean;
  reason?: 'pin-to-tab' | 'scenario';
  restored?: boolean;
  success: boolean;
};

type ContentRuntimeWakeupMessage = {
  pinToTab?: boolean;
  toolbarVisible?: boolean;
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
  pinToTabAvailable: boolean;
  toolbarVisible: boolean;
  userPinned: boolean;
  visibilityMutation: boolean;
};

type PinnedToolbarSessionOperation = ReturnType<typeof beginPinnedToolbarOperation>;

function parseContentRuntimeWakeupMessage(message: unknown): ContentRuntimeWakeupMessage | null {
  try {
    const parsed =
      runtimeActionCoreMessageContracts[MessageType.CONTENT_RUNTIME_WAKEUP].parseRequest(message);
    const sessionOperationCount = [
      parsed.pinToTab !== undefined,
      parsed.toolbarVisible !== undefined,
    ].filter(Boolean).length;
    if (sessionOperationCount > 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function readUserPinnedSessionState(tabId: number) {
  const [userPinned, toolbarVisible] = await Promise.all([
    readPinToTabSessionStorageState(tabId),
    readPinToTabToolbarVisibilitySessionStorageState(tabId),
  ]);
  return { toolbarVisible, userPinned };
}

async function projectUserPinnedState(args: {
  operation: PinnedToolbarSessionOperation;
  pinToTabAvailable: boolean;
  tabId: number;
  visibilityMutation: boolean;
}): Promise<UserPinnedState> {
  return {
    isCurrent: args.operation.isCurrent,
    pinToTabAvailable: args.pinToTabAvailable,
    ...(await readUserPinnedSessionState(args.tabId)),
    visibilityMutation: args.visibilityMutation,
  };
}

function observeUserPinnedSession(
  tabId: number,
  operation: PinnedToolbarSessionOperation
): Promise<UserPinnedState> {
  return operation.runExclusive(async () =>
    projectUserPinnedState({
      operation,
      pinToTabAvailable: await hasPinnedToolbarAllSitesAccess(),
      tabId,
      visibilityMutation: false,
    })
  );
}

function synchronizeToolbarVisibility(args: {
  operation: PinnedToolbarSessionOperation;
  tabId: number;
  toolbarVisible: boolean;
}): Promise<UserPinnedState> {
  return args.operation.runExclusive(async () => {
    const availability = hasPinnedToolbarAllSitesAccess();
    const currentState = await readUserPinnedSessionState(args.tabId);
    if (args.operation.isCurrent() && currentState.userPinned) {
      await writePinToTabSessionStorageState(
        args.tabId,
        { toolbarVisible: args.toolbarVisible },
        args.operation.isCurrent
      );
    }
    return projectUserPinnedState({
      operation: args.operation,
      pinToTabAvailable: await availability,
      tabId: args.tabId,
      visibilityMutation: true,
    });
  });
}

function synchronizeUserUnpin(
  tabId: number,
  operation: PinnedToolbarSessionOperation
): Promise<UserPinnedState> {
  return operation.runExclusive(async () => {
    const availability = hasPinnedToolbarAllSitesAccess();
    await writePinToTabSessionStorageState(tabId, { pinToTab: false }, operation.isCurrent);
    return projectUserPinnedState({
      operation,
      pinToTabAvailable: await availability,
      tabId,
      visibilityMutation: false,
    });
  });
}

async function commitUserPinSession(args: {
  operation: PinnedToolbarSessionOperation;
  tabId: number;
  toolbarVisible: boolean;
}): Promise<boolean> {
  if (!args.operation.isCurrent()) {
    return false;
  }

  const previousState = await readUserPinnedSessionState(args.tabId);
  if (!args.operation.isCurrent()) {
    return false;
  }

  await writePinToTabSessionStorageState(
    args.tabId,
    { pinToTab: true, toolbarVisible: args.toolbarVisible },
    args.operation.isCurrent
  );
  if (args.operation.isCurrent()) {
    return true;
  }

  await writePinToTabSessionStorageState(
    args.tabId,
    previousState.userPinned
      ? { pinToTab: true, toolbarVisible: previousState.toolbarVisible }
      : { pinToTab: false },
    () => true
  );
  return false;
}

async function synchronizeUserPinActivation(args: {
  operation: PinnedToolbarSessionOperation;
  senderBinding: ContentSenderBinding;
}): Promise<UserPinnedState> {
  const tabId = args.senderBinding.tabId;
  const pinToTabAvailable = await hasPinnedToolbarAllSitesAccess();
  if (!args.operation.isCurrent()) {
    return projectUserPinnedState({
      operation: args.operation,
      pinToTabAvailable,
      tabId,
      visibilityMutation: false,
    });
  }

  const toolbarStatus = pinToTabAvailable ? await waitForContentToolbarReady(tabId) : null;
  if (!args.operation.isCurrent()) {
    return projectUserPinnedState({
      operation: args.operation,
      pinToTabAvailable,
      tabId,
      visibilityMutation: false,
    });
  }

  return args.operation.runExclusive(async () => {
    if (!args.operation.isCurrent()) {
      return projectUserPinnedState({
        operation: args.operation,
        pinToTabAvailable,
        tabId,
        visibilityMutation: false,
      });
    }

    if (!pinToTabAvailable || toolbarStatus?.screenshotMode !== true) {
      await writePinToTabSessionStorageState(tabId, { pinToTab: false }, args.operation.isCurrent);
      return projectUserPinnedState({
        operation: args.operation,
        pinToTabAvailable,
        tabId,
        visibilityMutation: false,
      });
    }

    try {
      await registerPinnedToolbarAllSitesAccess({
        commit: () =>
          commitUserPinSession({
            operation: args.operation,
            tabId,
            toolbarVisible: toolbarStatus.visible,
          }),
        expectedUrl: args.senderBinding.senderUrl,
        isCurrent: args.operation.isCurrent,
        tabId,
      });
    } catch (error) {
      await writePinToTabSessionStorageState(tabId, { pinToTab: false }, args.operation.isCurrent);
      throw error;
    }

    return projectUserPinnedState({
      operation: args.operation,
      pinToTabAvailable,
      tabId,
      visibilityMutation: false,
    });
  });
}

async function synchronizeUserPinnedState(args: {
  message: ContentRuntimeWakeupMessage;
  senderBinding: ContentSenderBinding;
}): Promise<UserPinnedState> {
  const tabId = args.senderBinding.tabId;
  const requestedPinState = args.message.pinToTab;
  const requestedToolbarVisibility = args.message.toolbarVisible;
  if (requestedPinState === undefined && requestedToolbarVisibility === undefined) {
    return observeUserPinnedSession(tabId, observePinnedToolbarOperations(tabId));
  }

  if (requestedToolbarVisibility !== undefined) {
    return synchronizeToolbarVisibility({
      operation: beginPinnedToolbarDurableOperation(tabId),
      tabId,
      toolbarVisible: requestedToolbarVisibility,
    });
  }

  if (!requestedPinState) {
    return synchronizeUserUnpin(tabId, beginPinnedToolbarDurableOperation(tabId));
  }

  return synchronizeUserPinActivation({
    operation: beginPinnedToolbarOperation(tabId),
    senderBinding: args.senderBinding,
  });
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
  runtimeState: BackgroundRuntimeMessageDeps,
  options: {
    commitGuard?: () => boolean | Promise<boolean>;
    readPreparationState?: () => Promise<{ screenshotMode: boolean; visible: boolean }>;
    toolbarVisible?: boolean;
  } = {}
): Promise<boolean> {
  if (options.commitGuard) {
    return enableScreenshotModeGuarded(
      tabId,
      runtimeState.screenshotModeState,
      runtimeState.viewportState,
      runtimeState.viewportOwnerState,
      runtimeState.webSnapshotViewerPorts,
      {
        commitGuard: options.commitGuard,
        ...(options.readPreparationState
          ? { readPreparationState: options.readPreparationState }
          : {}),
        ...(options.toolbarVisible === undefined ? {} : { toolbarVisible: options.toolbarVisible }),
      }
    );
  }

  await enableScreenshotMode(
    tabId,
    runtimeState.screenshotModeState,
    runtimeState.viewportState,
    runtimeState.viewportOwnerState,
    runtimeState.webSnapshotViewerPorts,
    options.toolbarVisible === undefined ? {} : { toolbarVisible: options.toolbarVisible }
  );
  return true;
}

async function createSupersededWakeupResponse(
  tabId: number
): Promise<ContentRuntimeWakeupResponse> {
  return {
    pinToTab: await readPinToTabSessionStorageState(tabId),
    pinToTabAvailable: await hasPinnedToolbarAllSitesAccess(),
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
  toolbarVisible: boolean;
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

  await waitForContentToolbarReady(args.tabId);
  if (!args.isCurrent()) {
    return false;
  }

  if (args.userPinned || args.scenarioState.shouldEnablePreparation) {
    const scenarioOwnsPreparation = args.scenarioState.shouldEnablePreparation;
    const toolbarVisible = scenarioOwnsPreparation
      ? true
      : args.userPinned
        ? args.toolbarVisible
        : undefined;
    return enablePreparationForWakeup(args.tabId, args.runtimeState, {
      ...(toolbarVisible === undefined ? {} : { toolbarVisible }),
      ...(!scenarioOwnsPreparation && args.userPinned
        ? {
            commitGuard: async () => args.isCurrent() && (await hasPinnedToolbarAllSitesAccess()),
            readPreparationState: () => waitForContentToolbarReady(args.tabId),
          }
        : {}),
    });
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
      senderBinding: args.senderBinding,
    }),
    readScenarioRestoreState(tabId, args.runtimeState),
  ]);
  const userPinned = userPinState.userPinned;
  const pinToTabAvailable = userPinState.pinToTabAvailable;
  const restorableUserPin = userPinned && pinToTabAvailable;

  if (!userPinState.isCurrent()) {
    return createSupersededWakeupResponse(tabId);
  }

  if (userPinState.visibilityMutation) {
    return { pinToTab: userPinned, pinToTabAvailable, restored: false, success: true };
  }

  if (!restorableUserPin && !scenarioState.shouldRestore) {
    return { pinToTab: userPinned, pinToTabAvailable, restored: false, success: true };
  }

  const restored = await restoreRuntimeForWakeup({
    isCurrent: userPinState.isCurrent,
    runtimeState: args.runtimeState,
    scenarioState,
    tabId,
    toolbarVisible: userPinState.toolbarVisible,
    userPinned: restorableUserPin,
  });
  if (!userPinState.isCurrent()) {
    return createSupersededWakeupResponse(tabId);
  }

  if (!restored) {
    return { pinToTab: userPinned, pinToTabAvailable, restored: false, success: true };
  }

  return {
    pinToTab: userPinned,
    pinToTabAvailable,
    reason: restorableUserPin ? 'pin-to-tab' : 'scenario',
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
      pinToTabAvailable: false,
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
