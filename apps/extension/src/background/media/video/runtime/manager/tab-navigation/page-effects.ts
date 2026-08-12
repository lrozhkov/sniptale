import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { readTabCaptureViewport } from '../../../capture-viewport';
import { getVideoRecordingRuntimeState } from '../../session-state';
import { isControlledCursorCaptureEnabled } from '../../../session-state';
import { restoreRecordingOverlayAfterNavigation } from '../../../ui/overlay-restore';
import { enableViewportCursorProjection } from '../../../capture-surface/cursor-projection';
import {
  abandonControlledCursorNavigationEffects,
  beginControlledCursorNavigationEffects,
  restoreControlledCursorEffects,
  suspendControlledCursorEffects,
} from '../controlled-cursor/navigation-effects';
import {
  beginVideoRecordingSurfaceRebind,
  getVideoRecordingSurfaceLeaseSnapshot,
  updateVideoRecordingSurface,
} from '../../../content-surface/surface-lease';
import { createVideoRecordingSurfaceSnapshot } from '../../../content-surface/snapshot';
import { closeVideoRecordingCameraPeerForLease } from '../../../content-surface/camera-peer';
import { loadVideoSettings } from '../../../../../../composition/persistence/capture-settings';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const CROP_OVERLAY_RETRY_DELAYS_MS = [0, 100, 250, 500, 1000, 2000] as const;
const logger = createLogger({ namespace: 'BackgroundVideoTabNavigationPageEffects' });

export type TabNavigationPageEffects = {
  contentSurface?: boolean;
  controlledCursor: boolean;
  cropOverlay: boolean;
  viewportCursorProjection: boolean;
};

export type TabNavigationPageAccessVerifier = (
  tabId: number,
  failureMessage?: string
) => Promise<void>;

type TabNavigationEffectBinding = {
  generation: number;
  isCurrent: () => boolean;
  navigationEpoch: number | null;
  recordingId: string;
  shouldResume: boolean;
  tabId: number;
};

type TabNavigationPageEffectsResult = {
  controlledCursorRestored: boolean;
  liveViewport: ViewportInfo | null;
};

export function resolveTabNavigationPageEffects(
  viewportCursorProjection = false
): TabNavigationPageEffects {
  return {
    contentSurface: getVideoRecordingSurfaceLeaseSnapshot() !== null,
    controlledCursor: isControlledCursorCaptureEnabled(),
    cropOverlay: getVideoRecordingRuntimeState().captureMode === CaptureMode.TAB_CROP,
    viewportCursorProjection,
  };
}

export function beginTabNavigationPageEffects(effects: TabNavigationPageEffects): number | null {
  return effects.controlledCursor ? beginControlledCursorNavigationEffects() : null;
}

export function abandonTabNavigationPageEffects(
  effects: TabNavigationPageEffects,
  binding: TabNavigationEffectBinding
): void {
  if (effects.controlledCursor) abandonControlledCursorNavigationEffects(binding);
}

export async function suspendTabNavigationPageEffects(
  effects: TabNavigationPageEffects,
  binding: TabNavigationEffectBinding
): Promise<void> {
  if (effects.contentSurface) {
    const current = getVideoRecordingSurfaceLeaseSnapshot();
    if (current?.tabId === binding.tabId) {
      try {
        await closeVideoRecordingCameraPeerForLease(current);
      } catch (error) {
        await updateVideoRecordingSurface(current.surfaceSessionId, { lifecycle: 'degraded' });
        logger.warn('Embedded camera cleanup was deferred before navigation', error);
      }
    }
    // Rebinding invalidates the old document and peer generations even when
    // offscreen cleanup must be retried later. Toolbar restoration must not be
    // coupled to retirement of an optional camera peer.
    await beginVideoRecordingSurfaceRebind(binding.tabId);
  }
  if (effects.controlledCursor) {
    await suspendControlledCursorEffects(binding);
  }
}

function hasRestorablePageEffects(effects: TabNavigationPageEffects): boolean {
  return (
    effects.contentSurface ||
    effects.controlledCursor ||
    effects.cropOverlay ||
    effects.viewportCursorProjection
  );
}

async function restoreContentSurfaceEffect(
  enabled: boolean,
  binding: TabNavigationEffectBinding
): Promise<void> {
  if (!enabled || !binding.isCurrent()) return;
  const current = getVideoRecordingSurfaceLeaseSnapshot();
  if (!current || current.tabId !== binding.tabId || current.recordingId !== binding.recordingId) {
    return;
  }
  let restorable = current;
  let cameraCleanupDegraded = false;
  if (current.lifecycle === 'degraded') {
    try {
      await closeVideoRecordingCameraPeerForLease(current);
    } catch (error) {
      cameraCleanupDegraded = true;
      logger.warn('Embedded camera cleanup remains degraded after navigation', error);
    }
    restorable = (await beginVideoRecordingSurfaceRebind(binding.tabId)) ?? current;
  }
  const ready =
    (await updateVideoRecordingSurface(restorable.surfaceSessionId, {
      lifecycle: cameraCleanupDegraded ? 'degraded' : 'ready',
    })) ?? restorable;
  if (!binding.isCurrent()) return;
  const settings = await loadVideoSettings();
  if (!binding.isCurrent()) return;
  await getBackgroundRuntimeMessaging().sendTabMessage(binding.tabId, {
    type: VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
    snapshot: createVideoRecordingSurfaceSnapshot(ready, settings),
    surfaceToken: ready.surfaceToken,
  });
}

async function ensurePageEffectsAccess(
  effects: TabNavigationPageEffects,
  binding: TabNavigationEffectBinding,
  ensurePageAccess: TabNavigationPageAccessVerifier
): Promise<boolean> {
  try {
    await ensurePageAccess(
      binding.tabId,
      'Recording page effects cannot be restored on the navigated page.'
    );
    return true;
  } catch (error) {
    if (effects.cropOverlay) {
      throw new Error('Recording region could not be restored on the navigated page', {
        cause: error,
      });
    }
    logger.warn('Optional recording page effects could not be restored after navigation', error);
    return false;
  }
}

async function restoreViewportCursorProjectionEffect(
  enabled: boolean,
  binding: TabNavigationEffectBinding
): Promise<void> {
  if (!enabled) return;
  try {
    await enableViewportCursorProjection(binding.tabId, {
      generation: binding.generation,
      recordingId: binding.recordingId,
    });
  } catch (error) {
    logger.warn('Viewport cursor projection could not be restored after navigation', error);
  }
}

export async function restoreViewportCursorProjectionBeforeThaw(
  effects: TabNavigationPageEffects,
  binding: TabNavigationEffectBinding,
  ensurePageAccess: TabNavigationPageAccessVerifier
): Promise<void> {
  if (!effects.viewportCursorProjection || !binding.isCurrent()) return;
  try {
    await ensurePageAccess(
      binding.tabId,
      'Viewport cursor projection cannot be restored on the navigated page.'
    );
    if (!binding.isCurrent()) return;
    await restoreViewportCursorProjectionEffect(true, binding);
  } catch (error) {
    logger.warn('Viewport cursor projection could not be prepared before output resumed', error);
  }
}

async function readPageEffectsViewport(
  effects: TabNavigationPageEffects,
  tabId: number
): Promise<ViewportInfo | null> {
  if (!effects.controlledCursor && !effects.cropOverlay) return null;
  try {
    return await readTabCaptureViewport(tabId);
  } catch (error) {
    if (effects.cropOverlay) {
      throw new Error('Recording region viewport could not be verified after navigation', {
        cause: error,
      });
    }
    logger.warn('Live viewport could not be read after navigation', error);
    return null;
  }
}

async function restoreControlledCursorPageEffect(
  enabled: boolean,
  binding: TabNavigationEffectBinding
): Promise<boolean> {
  if (!enabled) return true;
  try {
    await restoreControlledCursorEffects(binding);
    return true;
  } catch (error) {
    logger.warn('Controlled cursor could not reconnect after navigation', error);
    return false;
  }
}

async function restoreCropOverlayPageEffect(
  enabled: boolean,
  binding: TabNavigationEffectBinding
): Promise<void> {
  if (!enabled) return;
  const state = getVideoRecordingRuntimeState();
  const cropRegion = state.cropRegion ?? state.captureSource?.cropRegion;
  if (!cropRegion) {
    throw new Error('Recording region is unavailable after navigation');
  }
  const restored = await restoreRecordingOverlayAfterNavigation(
    binding.tabId,
    cropRegion,
    binding.isCurrent,
    [...CROP_OVERLAY_RETRY_DELAYS_MS]
  );
  if (!restored) {
    throw new Error('Recording region overlay could not be restored after navigation');
  }
}

export async function restoreTabNavigationPageEffects(
  effects: TabNavigationPageEffects,
  binding: TabNavigationEffectBinding,
  ensurePageAccess: TabNavigationPageAccessVerifier
): Promise<TabNavigationPageEffectsResult> {
  if (!binding.isCurrent()) {
    return { controlledCursorRestored: true, liveViewport: null };
  }
  if (!hasRestorablePageEffects(effects)) {
    return { controlledCursorRestored: true, liveViewport: null };
  }
  if (!(await ensurePageEffectsAccess(effects, binding, ensurePageAccess))) {
    return { controlledCursorRestored: !effects.controlledCursor, liveViewport: null };
  }
  if (!binding.isCurrent()) {
    return { controlledCursorRestored: true, liveViewport: null };
  }
  await restoreContentSurfaceEffect(effects.contentSurface === true, binding);
  if (!binding.isCurrent()) {
    return { controlledCursorRestored: true, liveViewport: null };
  }
  await restoreViewportCursorProjectionEffect(effects.viewportCursorProjection, binding);
  if (!binding.isCurrent()) {
    return { controlledCursorRestored: true, liveViewport: null };
  }
  const liveViewport = await readPageEffectsViewport(effects, binding.tabId);
  if (!binding.isCurrent()) {
    return { controlledCursorRestored: true, liveViewport: null };
  }
  const controlledCursorRestored = await restoreControlledCursorPageEffect(
    effects.controlledCursor,
    binding
  );
  if (!controlledCursorRestored) return { controlledCursorRestored, liveViewport };
  if (!binding.isCurrent()) return { controlledCursorRestored: true, liveViewport };
  await restoreCropOverlayPageEffect(effects.cropOverlay, binding);
  return { controlledCursorRestored: true, liveViewport };
}
