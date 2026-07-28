import { createLogger } from '@sniptale/platform/observability/logger';
import {
  appendControlledCursorTelemetry,
  beginControlledCursorNavigation,
  clearControlledCursorNavigationPending,
  getControlledCursorOffsetSeconds,
  getVideoRecordingTabId,
  isControlledCursorCaptureEnabled,
  setControlledCursorAutoPaused,
  setControlledCursorOffsetSeconds,
} from '../../../session-state';
import { getVideoRecordingRuntimeState } from '../../session-state';
import {
  disableControlledCursorCapture,
  enableControlledCursorCapture,
  syncControlledCursorCapture,
} from './messages';

const logger = createLogger({ namespace: 'BackgroundVideoControlledCursorNavigationEffects' });
const REBOOTSTRAP_RETRY_DELAYS_MS = [0, 250, 1000] as const;

type NavigationEffectBinding = {
  isCurrent: () => boolean;
  navigationEpoch: number | null;
  recordingId: string;
  shouldResume: boolean;
  tabId: number;
};

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isControlledCursorEffectActive(binding: NavigationEffectBinding): boolean {
  return (
    binding.isCurrent() &&
    isControlledCursorCaptureEnabled() &&
    getVideoRecordingTabId() === binding.tabId
  );
}

function clearControlledCursorEffects(binding: NavigationEffectBinding): boolean {
  if (
    !binding.isCurrent() ||
    binding.navigationEpoch === null ||
    !clearControlledCursorNavigationPending(binding.navigationEpoch)
  ) {
    return false;
  }
  setControlledCursorAutoPaused(false);
  return true;
}

export function beginControlledCursorNavigationEffects(): number {
  return beginControlledCursorNavigation();
}

export function abandonControlledCursorNavigationEffects(binding: NavigationEffectBinding): void {
  clearControlledCursorEffects(binding);
}

export async function suspendControlledCursorEffects(
  binding: NavigationEffectBinding
): Promise<void> {
  if (!isControlledCursorCaptureEnabled() || getVideoRecordingTabId() !== binding.tabId) return;
  setControlledCursorAutoPaused(binding.shouldResume);
  setControlledCursorOffsetSeconds(getVideoRecordingRuntimeState().duration);
  try {
    const telemetry = await disableControlledCursorCapture(binding.tabId);
    if (isControlledCursorEffectActive(binding)) appendControlledCursorTelemetry(telemetry);
  } catch (error) {
    logger.warn('Failed to flush controlled cursor telemetry before navigation', error);
  }
}

export async function restoreControlledCursorEffects(
  binding: NavigationEffectBinding
): Promise<void> {
  if (!isControlledCursorCaptureEnabled() || getVideoRecordingTabId() !== binding.tabId) {
    clearControlledCursorEffects(binding);
    return;
  }

  for (const delayMs of REBOOTSTRAP_RETRY_DELAYS_MS) {
    if (delayMs > 0) await wait(delayMs);
    if (!isControlledCursorEffectActive(binding)) return;
    try {
      await enableControlledCursorCapture(
        binding.tabId,
        binding.recordingId,
        getControlledCursorOffsetSeconds()
      );
      if (!isControlledCursorEffectActive(binding)) return;
      await syncControlledCursorCapture(binding.tabId, binding.shouldResume ? 'resume' : 'pause');
      if (!isControlledCursorEffectActive(binding)) return;
      clearControlledCursorEffects(binding);
      return;
    } catch (error) {
      logger.warn('Controlled cursor re-bootstrap attempt failed', {
        delayMs,
        error,
        recordingId: binding.recordingId,
        tabId: binding.tabId,
      });
    }
  }

  clearControlledCursorEffects(binding);
  throw new Error('Controlled cursor capture could not be restored after navigation');
}
