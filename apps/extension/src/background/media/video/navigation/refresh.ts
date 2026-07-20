import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoViewportPresetSelection } from '@sniptale/runtime-contracts/video/types/types';
import { sendRuntimeMessage } from '../../../../platform/runtime-messaging';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { armDebuggerActivation } from '../../../debugger/session/activation';
import { attachDebugger } from '../../../debugger/session/attach';
import { resetZoom, setViewport } from '../../../debugger/workspace';
import {
  logger,
  resolveViewportPixelBounds,
  VIEWPORT_NAVIGATION_REFRESH_RETRY_LIMIT,
  VIEWPORT_NAVIGATION_SETTLE_MS,
  waitForViewportSettle,
} from './shared';
import { setViewportRecordingDrawState } from './viewport-draw-state';

type RefreshViewportRecordingAfterNavigationArgs = {
  tabId: number;
  viewportPreset: VideoViewportPresetSelection;
  navigationEpoch: number;
  isCurrentNavigationEpoch: () => boolean;
  settleDelayMs?: number;
};

export async function refreshViewportRecordingAfterNavigation(
  args: RefreshViewportRecordingAfterNavigationArgs
): Promise<void> {
  await refreshViewportRecordingAfterNavigationAttempt(args, 0);
}

async function refreshViewportRecordingAfterNavigationAttempt(
  args: RefreshViewportRecordingAfterNavigationArgs,
  attempt: number
): Promise<void> {
  try {
    await applyViewportRecordingAfterNavigation(args);
  } catch (error) {
    await handleViewportRecordingRefreshFailure(args, attempt, error);
  }
}

async function applyViewportRecordingAfterNavigation(
  args: RefreshViewportRecordingAfterNavigationArgs
): Promise<void> {
  const {
    tabId,
    viewportPreset,
    navigationEpoch,
    isCurrentNavigationEpoch,
    settleDelayMs = VIEWPORT_NAVIGATION_SETTLE_MS,
  } = args;

  const emulation = await applyViewportEmulation(tabId, viewportPreset);
  if (!isCurrentNavigationEpoch()) {
    return;
  }

  const emulatedViewportCssSize = resolveViewportPixelBounds(emulation);

  await sendViewportRecordingCropUpdate(viewportPreset, emulatedViewportCssSize);

  if (!isCurrentNavigationEpoch()) {
    return;
  }

  await waitForViewportSettle(settleDelayMs);
  if (!isCurrentNavigationEpoch()) {
    return;
  }

  await setViewportRecordingDrawState({
    frozen: false,
    navigationEpoch,
  });

  logger.log('Viewport recording crop refreshed after navigation', {
    preset: viewportPreset,
    emulation,
    emulatedViewportCssSize,
    navigationEpoch,
  });
}

async function applyViewportEmulation(tabId: number, viewportPreset: VideoViewportPresetSelection) {
  await attachDebugger(
    tabId,
    'video-emulation',
    armDebuggerActivation({
      client: 'video-emulation',
      reason: 'viewport-recording-navigation-refresh',
      tabId,
    })
  );
  await resetZoom(tabId);
  return setViewport(tabId, viewportPreset.width, viewportPreset.height);
}

async function sendViewportRecordingCropUpdate(
  viewportPreset: VideoViewportPresetSelection,
  emulatedViewportCssSize: { width: number; height: number }
): Promise<void> {
  await sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP,
      targetResolution: {
        width: viewportPreset.width,
        height: viewportPreset.height,
      },
      emulatedViewportCssSize,
    })
  );
}

async function handleViewportRecordingRefreshFailure(
  args: RefreshViewportRecordingAfterNavigationArgs,
  attempt: number,
  error: unknown
): Promise<void> {
  const {
    navigationEpoch,
    isCurrentNavigationEpoch,
    settleDelayMs = VIEWPORT_NAVIGATION_SETTLE_MS,
  } = args;

  if (!isCurrentNavigationEpoch()) {
    return;
  }

  if (attempt < VIEWPORT_NAVIGATION_REFRESH_RETRY_LIMIT) {
    logger.warn('Viewport refresh failed after navigation, retrying', {
      attempt: attempt + 1,
      navigationEpoch,
      error,
    });

    await waitForViewportSettle(settleDelayMs);
    if (!isCurrentNavigationEpoch()) {
      return;
    }

    await refreshViewportRecordingAfterNavigationAttempt(args, attempt + 1);
    return;
  }

  await unfreezeViewportRecordingAfterRefreshFailure(navigationEpoch);
  logger.warn('Failed to refresh viewport recording after navigation', error);
}

async function unfreezeViewportRecordingAfterRefreshFailure(
  navigationEpoch: number
): Promise<void> {
  // If CDP reattach never recovers after a target swap, prefer showing the live tab
  // over holding the previous page frame forever.
  await setViewportRecordingDrawState({
    frozen: false,
    navigationEpoch,
  }).catch((unfreezeError: unknown) => {
    logger.warn('Failed to unfreeze viewport recording after refresh error', {
      navigationEpoch,
      error: unfreezeError,
    });
  });
}
