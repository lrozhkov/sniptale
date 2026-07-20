import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { readPinToTabSessionStorageState } from '../../../composition/persistence/content-pin-session/index';
import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ContentSenderBinding } from '../../routing-contracts/capabilities/content-action/capability-store';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';
import { respondAsyncRoute } from '../../routing-contracts/response';
import { ensureActivePageAccessRuntime, hasActivePageAccess } from './service';
import { enableScreenshotMode } from '../tab-mode-router-screenshot';

type ContentRuntimeWakeupResponse = {
  error?: string;
  reason?: 'pin-to-tab' | 'scenario';
  restored?: boolean;
  success: boolean;
};

type ScenarioRestoreState = {
  shouldEnablePreparation: boolean;
  shouldRestore: boolean;
  shouldWriteForcedScenarioSurface: boolean;
  surface: ScenarioRecorderSurfaceState;
};

function isContentRuntimeWakeupMessage(message: unknown): message is {
  type: typeof MessageType.CONTENT_RUNTIME_WAKEUP;
} {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === MessageType.CONTENT_RUNTIME_WAKEUP
  );
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
  runtimeState: BackgroundRuntimeMessageDeps;
  senderBinding: ContentSenderBinding;
}): Promise<ContentRuntimeWakeupResponse> {
  const tabId = args.senderBinding.tabId;
  const [userPinned, scenarioState] = await Promise.all([
    readPinToTabSessionStorageState(tabId),
    readScenarioRestoreState(tabId, args.runtimeState),
  ]);

  if (!userPinned && !scenarioState.shouldRestore) {
    return { restored: false, success: true };
  }

  if (!(await hasActivePageAccess(tabId))) {
    return { restored: false, success: true };
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
  if (!isContentRuntimeWakeupMessage(args.message)) {
    return false;
  }

  if (!args.senderBinding) {
    args.sendResponse({
      restored: false,
      success: false,
    });
    return true;
  }

  respondAsyncRoute(
    handleContentRuntimeWakeup({
      runtimeState: args.runtimeState,
      senderBinding: args.senderBinding,
    }),
    args.sendResponse
  );
  return true;
}
