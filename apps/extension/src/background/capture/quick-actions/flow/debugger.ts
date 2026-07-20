import { armDebuggerActivation } from '../../../debugger/session/activation';
import { attachDebuggerSafe } from '../../../debugger/session/attach';
import { detachDebugger } from '../../../debugger/session/detach';
import { clearViewport, resetZoom, setViewport } from '../../../debugger/workspace';
import type { Settings, ViewportPreset } from '../../../../contracts/settings';
import type { ViewportState } from './shared';

type QuickActionDebuggerSetup =
  | { cleanup: () => Promise<void>; ready: true }
  | { cleanup?: undefined; ready: false };

export function isDebuggerRequired(emulation: string): boolean {
  return !!emulation && emulation !== 'native';
}

async function cleanupQuickActionDebugger(
  tabId: number,
  viewportState: ViewportState
): Promise<void> {
  viewportState.delete(tabId);
  try {
    await clearViewport(tabId);
  } finally {
    await detachDebugger(tabId, 'screenshot');
  }
}

export async function setupQuickActionDebugger(
  tabId: number,
  emulation: string,
  settings: Settings,
  viewportState: ViewportState
): Promise<QuickActionDebuggerSetup> {
  if (!isDebuggerRequired(emulation)) {
    return { cleanup: async () => undefined, ready: true };
  }

  const viewportPresets: ViewportPreset[] = settings.viewportPresets ?? [];
  const preset = viewportPresets.find((candidate) => candidate.id === emulation);
  if (!preset) {
    return { cleanup: async () => undefined, ready: true };
  }

  const attached = await attachDebuggerSafe(
    tabId,
    'screenshot',
    armDebuggerActivation({ client: 'screenshot', reason: 'quick-action-viewport', tabId })
  );
  if (!attached) {
    return { ready: false };
  }

  try {
    await setViewport(tabId, preset.width, preset.height);
    await resetZoom(tabId);
    viewportState.set(tabId, { width: preset.width, height: preset.height });
  } catch (error) {
    await cleanupQuickActionDebugger(tabId, viewportState);
    throw error;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { cleanup: () => cleanupQuickActionDebugger(tabId, viewportState), ready: true };
}
