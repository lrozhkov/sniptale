import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { readTabCaptureViewport } from '../../../capture-viewport';
import { getVideoRecordingRuntimeState } from '../../session-state';
import { isControlledCursorCaptureEnabled } from '../../../session-state';
import { restoreRecordingOverlayAfterNavigation } from '../../../ui/overlay-restore';
import {
  abandonControlledCursorNavigationEffects,
  beginControlledCursorNavigationEffects,
  restoreControlledCursorEffects,
  suspendControlledCursorEffects,
} from '../controlled-cursor/navigation-effects';

const CROP_OVERLAY_RETRY_DELAYS_MS = [0, 100, 250, 500, 1000, 2000] as const;
const logger = createLogger({ namespace: 'BackgroundVideoTabNavigationPageEffects' });

export type TabNavigationPageEffects = {
  controlledCursor: boolean;
  cropOverlay: boolean;
};

export type TabNavigationPageAccessVerifier = (
  tabId: number,
  failureMessage?: string
) => Promise<void>;

type TabNavigationEffectBinding = {
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

export function resolveTabNavigationPageEffects(): TabNavigationPageEffects {
  return {
    controlledCursor: isControlledCursorCaptureEnabled(),
    cropOverlay: getVideoRecordingRuntimeState().captureMode === CaptureMode.TAB_CROP,
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
  if (effects.controlledCursor) {
    await suspendControlledCursorEffects(binding);
  }
}

export async function restoreTabNavigationPageEffects(
  effects: TabNavigationPageEffects,
  binding: TabNavigationEffectBinding,
  ensurePageAccess: TabNavigationPageAccessVerifier
): Promise<TabNavigationPageEffectsResult> {
  if (!effects.controlledCursor && !effects.cropOverlay) {
    return { controlledCursorRestored: true, liveViewport: null };
  }
  try {
    await ensurePageAccess(
      binding.tabId,
      'Recording page effects cannot be restored on the navigated page.'
    );
  } catch (error) {
    if (effects.cropOverlay) {
      throw new Error('Recording region could not be restored on the navigated page', {
        cause: error,
      });
    }
    logger.warn('Controlled cursor page effects could not be restored after navigation', error);
    return { controlledCursorRestored: !effects.controlledCursor, liveViewport: null };
  }
  let liveViewport: ViewportInfo | null = null;
  try {
    liveViewport = await readTabCaptureViewport(binding.tabId);
  } catch (error) {
    if (effects.cropOverlay) {
      throw new Error('Recording region viewport could not be verified after navigation', {
        cause: error,
      });
    }
    logger.warn('Live viewport could not be read after navigation', error);
  }
  if (effects.controlledCursor) {
    try {
      await restoreControlledCursorEffects(binding);
    } catch (error) {
      logger.warn('Controlled cursor could not reconnect after navigation', error);
      return { controlledCursorRestored: false, liveViewport };
    }
  }
  if (!effects.cropOverlay) return { controlledCursorRestored: true, liveViewport };

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
  return { controlledCursorRestored: true, liveViewport };
}
