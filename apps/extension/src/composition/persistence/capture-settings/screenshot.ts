import { normalizeScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import { browserStorage } from '../infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import { parseStoredScreenshotSetupState } from './screenshot-guards';
import type { ScreenshotSetupState } from './screenshot-contracts';

const SCREENSHOT_SETUP_KEY = 'sniptale_screenshot_setup';

export type { ScreenshotSetupMode, ScreenshotSetupState } from './screenshot-contracts';

export const DEFAULT_SCREENSHOT_SETUP_STATE: ScreenshotSetupState = {
  selectedMode: 'quick-actions',
  tab: {
    screenshotMode: 'visible',
    viewportPresetId: null,
    delay: null,
    afterCapture: 'download_default',
    imageFormat: null,
    imageQuality: null,
    exitAfterCapture: false,
  },
  desktop: {
    screenshotMode: 'desktop',
    viewportPresetId: null,
    delay: null,
    afterCapture: 'download_default',
    imageFormat: null,
    imageQuality: null,
    exitAfterCapture: false,
  },
};

export async function loadScreenshotSetupState(): Promise<ScreenshotSetupState> {
  const stored = await browserStorage.local.get([SCREENSHOT_SETUP_KEY]);
  const parsed = {
    ...DEFAULT_SCREENSHOT_SETUP_STATE,
    ...parseStoredScreenshotSetupState(stored[SCREENSHOT_SETUP_KEY]),
  };
  return {
    ...parsed,
    tab: normalizeScreenshotCaptureConfig(parsed.tab),
    desktop: normalizeScreenshotCaptureConfig(parsed.desktop),
  };
}

export async function patchScreenshotSetupState(
  patch: Partial<ScreenshotSetupState>
): Promise<ScreenshotSetupState> {
  return runWithPersistenceDomainMutationLock('screenshot-setup', async (permit) => {
    const current = await loadScreenshotSetupState();
    const next = { ...current, ...patch };
    await browserStorage.local.set({ [SCREENSHOT_SETUP_KEY]: next }, permit);
    return next;
  });
}
