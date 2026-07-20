import { afterEach, expect, it, vi } from 'vitest';

import type { PageAccessStatus } from '@sniptale/runtime-contracts/messaging/page-access';
import type { QuickAction } from '../../../contracts/settings';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { createPopupAppShellRuntime } from '../app-shell/test-support/runtime';
import type { PopupRuntimeState } from '../runtime/types/state';

vi.mock('../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

vi.mock('../navigation/actions', (_importOriginal) => ({
  formatHotkeyShort: vi.fn(() => 'Ctrl+Shift+1'),
  getQuickActionMeta: vi.fn(() => 'Quick action'),
  openDesignSystem: vi.fn(),
  openGallery: vi.fn(),
  openImageEditor: vi.fn(),
  openScenarioEditor: vi.fn(),
  openScreenshotMode: vi.fn(),
  openSettings: vi.fn(),
  openGithubRepository: vi.fn(),
  openVideoEditor: vi.fn(),
  triggerQuickAction: vi.fn(),
}));

function setDesignSystemFlag(value: boolean | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, '__ENABLE_DESIGN_SYSTEM__');
    return;
  }

  Object.defineProperty(globalThis, '__ENABLE_DESIGN_SYSTEM__', {
    configurable: true,
    value,
  });
}

function createRuntimeState(): PopupRuntimeState {
  return createPopupAppShellRuntime({
    galleryStatus: null,
    recordingState: {
      status: VideoRecordingStatus.IDLE,
      duration: 0,
      countdownEndsAt: null,
      captureMode: null,
      captureSource: null,
      viewportPreset: null,
      error: null,
    },
    selectedPresetId: null,
    videoCaptureMode: CaptureMode.TAB,
    viewportPresets: [],
  });
}

function createInactivePageAccessStatus(): PageAccessStatus {
  return {
    allSitesGranted: false,
    currentTabActive: false,
    currentTabId: 1,
    currentTabOrigin: 'https://example.test',
    siteGranted: false,
    supported: true,
  };
}

function createQuickAction(id = 'quick-1'): QuickAction {
  return {
    afterCapture: 'download_default',
    bundledId: null,
    delay: null,
    emulation: 'native',
    exitAfterCapture: true,
    hotkey: {
      altKey: false,
      ctrlKey: true,
      key: '1',
      metaKey: false,
      shiftKey: true,
    },
    icon: 'Zap',
    id,
    imageFormat: 'png',
    imageQuality: null,
    name: 'Quick action',
    origin: 'user',
    screenshotMode: 'visible',
    status: true,
  };
}

afterEach(() => {
  vi.resetModules();
  setDesignSystemFlag(undefined);
});

it('includes the design system utility action outside release builds', async () => {
  setDesignSystemFlag(true);

  const { buildPopupCommandPaletteActions } = await import('./actions');

  expect(
    buildPopupCommandPaletteActions(createRuntimeState()).some(
      (action) => action.id === 'popup-open-design-system'
    )
  ).toBe(true);
});

it('omits the design system utility action in release builds', async () => {
  setDesignSystemFlag(false);

  const { buildPopupCommandPaletteActions } = await import('./actions');

  expect(
    buildPopupCommandPaletteActions(createRuntimeState()).some(
      (action) => action.id === 'popup-open-design-system'
    )
  ).toBe(false);
});

it('marks the active popup page as the current navigation target', async () => {
  const { buildPopupCommandPaletteActions } = await import('./actions');
  const runtime = createRuntimeState();
  runtime.navigation.page = 'video';

  const navigationActions = buildPopupCommandPaletteActions(runtime).filter((action) =>
    action.id.startsWith('popup-page-')
  );

  expect(navigationActions.find((action) => action.id === 'popup-page-video')?.subtitle).toBe(
    'shared.ui.commandPaletteCurrentPageHint'
  );
  expect(navigationActions.find((action) => action.id === 'popup-page-home')?.subtitle).toBe(
    'shared.ui.commandPaletteNavigationHint'
  );
  expect(navigationActions.find((action) => action.id === 'popup-page-export')?.subtitle).toBe(
    'shared.ui.commandPaletteNavigationHint'
  );
});

it('keeps the manually selected navigation target while recording is active', async () => {
  const { buildPopupCommandPaletteActions } = await import('./actions');
  const runtime = createRuntimeState();
  runtime.navigation.page = 'export';
  runtime.recording.recordingActive = true;

  const navigationActions = buildPopupCommandPaletteActions(runtime).filter((action) =>
    action.id.startsWith('popup-page-')
  );

  expect(navigationActions.find((action) => action.id === 'popup-page-export')?.subtitle).toBe(
    'shared.ui.commandPaletteCurrentPageHint'
  );
});

it('includes the scenario editor action in the primary command-palette group', async () => {
  const { buildPopupCommandPaletteActions } = await import('./actions');

  expect(
    buildPopupCommandPaletteActions(createRuntimeState()).some(
      (action) => action.id === 'popup-open-scenario-editor'
    )
  ).toBe(true);
});

it('preserves custom and shared subtitles for popup action groups', async () => {
  const { buildPopupCommandPaletteActions } = await import('./actions');
  const runtime = createRuntimeState();
  runtime.environment.galleryStatus = { text: 'Gallery synced', pressure: 'healthy' };
  runtime.home.quickActions = [createQuickAction()];

  const actions = buildPopupCommandPaletteActions(runtime);

  expect(actions.find((action) => action.id === 'popup-open-screenshot')?.subtitle).toBe(
    'popup.home.screenshotPrepTitle'
  );
  expect(actions.find((action) => action.id === 'popup-open-gallery')?.subtitle).toBe(
    'Gallery synced'
  );
  expect(actions.find((action) => action.id === 'popup-quick-action-quick-1')?.subtitle).toBe(
    'Quick action'
  );
  expect(actions.find((action) => action.id === 'popup-open-settings')?.subtitle).toBe(
    'shared.ui.commandPaletteUtilityHint'
  );
});

it('gates page-owned command-palette actions while page access is inactive', async () => {
  const { buildPopupCommandPaletteActions } = await import('./actions');
  const runtime = createRuntimeState();
  runtime.home.quickActions = [createQuickAction()];
  runtime.environment.pageAccess = {
    disabledReason: 'popup.home.pageAccessRequired',
    error: null,
    handleRequest: async () => undefined,
    loading: false,
    pendingOperation: null,
    status: createInactivePageAccessStatus(),
  };

  const actions = buildPopupCommandPaletteActions(runtime);

  expect(actions.find((action) => action.id === 'popup-quick-action-quick-1')).toBeUndefined();
  expect(actions.find((action) => action.id === 'popup-page-export')).toMatchObject({
    disabled: true,
    disabledReason: 'popup.home.pageAccessRequired',
  });
  expect(actions.find((action) => action.id === 'popup-open-screenshot')).toMatchObject({
    disabled: true,
    disabledReason: 'popup.home.pageAccessRequired',
  });
  expect(actions.find((action) => action.id === 'popup-start-recording')).toMatchObject({
    disabled: true,
    disabledReason: 'popup.home.pageAccessRequired',
  });
});

it('keeps screen recording available in the command palette while page access is inactive', async () => {
  const { buildPopupCommandPaletteActions } = await import('./actions');
  const runtime = createRuntimeState();
  runtime.recording.videoCaptureMode = CaptureMode.SCREEN;
  runtime.environment.pageAccess = {
    disabledReason: 'popup.home.pageAccessRequired',
    error: null,
    handleRequest: async () => undefined,
    loading: false,
    pendingOperation: null,
    status: createInactivePageAccessStatus(),
  };

  const actions = buildPopupCommandPaletteActions(runtime);

  expect(actions.find((action) => action.id === 'popup-start-recording')).toMatchObject({
    disabled: false,
  });
});

it('does not require a viewport preset before starting from the command palette', async () => {
  const { buildPopupCommandPaletteActions } = await import('./actions');
  const runtime = createRuntimeState();
  runtime.recording.videoCaptureMode = CaptureMode.VIEWPORT_EMULATION;
  runtime.recording.selectedPresetId = null;

  const actions = buildPopupCommandPaletteActions(runtime);

  expect(actions.find((action) => action.id === 'popup-start-recording')).toMatchObject({
    disabled: false,
  });
});
