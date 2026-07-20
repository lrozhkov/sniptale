import { getQuickActions } from '../../../../composition/persistence/quick-actions';
import { loadSettings } from '../../../../composition/persistence/settings';
import type { QuickActionRuntimeContext } from './shared';

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

export function resolveQuickActionRuntimeContext(
  action: QuickActionRuntimeContext['action'],
  settings: QuickActionRuntimeContext['settings']
): QuickActionRuntimeContext {
  return {
    action,
    afterCapture: action.afterCapture ?? 'download_default',
    captureMode: action.screenshotMode || 'visible',
    delaySeconds: action.delay ?? 0,
    emulation: action.emulation ?? settings.defaultViewportId ?? 'native',
    imageFormat: action.imageFormat || settings.imageFormat || 'png',
    imageQuality: action.imageQuality || settings.imageQuality || 90,
    settings,
  };
}
