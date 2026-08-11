import { getQuickActions } from '../../../../composition/persistence/quick-actions';
import { loadSettings } from '../../../../composition/persistence/settings';
import type { QuickActionRuntimeContext } from './shared';
import { assertQuickActionPolicy } from '../../../../features/quick-actions-presets/policy';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import { normalizeScreenshotCaptureConfigPolicy } from '../../../../features/quick-actions-presets/policy';

export async function loadQuickActionRuntimeContext(
  actionId: string
): Promise<QuickActionRuntimeContext> {
  const [actions, settings] = await Promise.all([getQuickActions(), loadSettings()]);
  const action = actions.find((candidate) => candidate.id === actionId);
  if (!action) {
    throw new Error('Quick action not found');
  }

  return resolveQuickActionRuntimeContext(action, settings);
}

export async function loadScreenshotCaptureRuntimeContext(
  config: ScreenshotCaptureConfig
): Promise<QuickActionRuntimeContext> {
  const settings = await loadSettings();
  const normalizedConfig = normalizeScreenshotCaptureConfigPolicy(config);
  return resolveQuickActionRuntimeContext(
    {
      id: 'popup-screenshot-setup',
      status: true,
      name: 'Popup screenshot setup',
      icon: 'Camera',
      ...normalizedConfig,
    },
    settings
  );
}

export function resolveQuickActionRuntimeContext(
  action: QuickActionRuntimeContext['action'],
  settings: QuickActionRuntimeContext['settings']
): QuickActionRuntimeContext {
  assertQuickActionPolicy(action);
  const afterCapture = action.afterCapture ?? 'download_default';
  return {
    action,
    afterCapture,
    captureMode: action.screenshotMode || 'visible',
    delaySeconds: action.delay ?? 0,
    viewportPresetId: action.viewportPresetId ?? null,
    imageFormat:
      afterCapture === 'copy' ? 'png' : action.imageFormat || settings.imageFormat || 'png',
    imageQuality: action.imageQuality || settings.imageQuality || 90,
    settings,
  };
}
