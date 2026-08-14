import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const {
  browserTabsGetMock,
  copyContextMenuExportPreviewMock,
  enableScreenshotModeMock,
  ensureActivePageAccessRuntimeMock,
  ensureNativeVisibleCaptureAuthorityMock,
  getContextMenuVideoPresetAvailabilityMock,
  getViewportPresetErrorMessageMock,
  loadSettingsMock,
  loggerWarnMock,
  showContextMenuToastMock,
  startContextMenuExportMock,
  startContextMenuVideoRecordingMock,
} = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  copyContextMenuExportPreviewMock: vi.fn(),
  enableScreenshotModeMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  ensureNativeVisibleCaptureAuthorityMock: vi.fn(),
  getContextMenuVideoPresetAvailabilityMock: vi.fn(),
  getViewportPresetErrorMessageMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  showContextMenuToastMock: vi.fn(),
  startContextMenuExportMock: vi.fn(),
  startContextMenuVideoRecordingMock: vi.fn(),
}));

vi.mock('../../../features/viewport-presets/error-message', () => ({
  getViewportPresetErrorMessage: getViewportPresetErrorMessageMock,
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: browserTabsGetMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: loggerWarnMock,
  })),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../capture/quick-actions', () => ({
  handleQuickAction: vi.fn(),
}));

vi.mock('../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/service')>()),
  ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
  ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
}));

vi.mock('./action-helpers', async () => {
  const actual = await vi.importActual('./action-helpers');
  return {
    ...actual,
    copyContextMenuExportPreview: copyContextMenuExportPreviewMock,
    getContextMenuVideoPresetAvailability: getContextMenuVideoPresetAvailabilityMock,
    showContextMenuToast: showContextMenuToastMock,
    startContextMenuExport: startContextMenuExportMock,
    startContextMenuVideoRecording: startContextMenuVideoRecordingMock,
  };
});

vi.mock('../tab-mode-router-screenshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tab-mode-router-screenshot')>()),
  enableScreenshotMode: enableScreenshotModeMock,
}));

import {
  handleBackgroundContextMenuAction,
  handleBackgroundContextMenuQuickAction,
  hasContextMenuVideoPreset,
  showBackgroundContextMenuError,
} from './actions';
import {
  CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
  CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
  CONTEXT_MENU_VIDEO_AREA_ID,
  CONTEXT_MENU_VIDEO_TAB_ID,
  CONTEXT_MENU_VIDEO_WINDOW_ID,
} from './constants';

function createDeps() {
  return {
    captureGuardState: { isCapturing: false },
    screenshotModeState: new Map<number, boolean>(),
    viewportOwnerState: new Map<number, 'capture-surface' | 'viewer'>(),
    viewportState: new Map<
      number,
      { presetId: string; target: 'window' | 'window'; width: number; height: number } | null
    >(),
  };
}

function createTab(url = 'https://example.test', id = 9): chrome.tabs.Tab {
  return { id, url } as chrome.tabs.Tab;
}

function resetContextMenuActionCoverageMocks(): void {
  vi.clearAllMocks();
  browserTabsGetMock.mockResolvedValue(createTab('https://resolved.example', 12));
  copyContextMenuExportPreviewMock.mockResolvedValue(undefined);
  enableScreenshotModeMock.mockResolvedValue(undefined);
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  ensureNativeVisibleCaptureAuthorityMock.mockResolvedValue(undefined);
  loadSettingsMock.mockResolvedValue({
    captureAction: 'download_default',
    contextMenu: {
      enabled: true,
      showScreenshots: true,
      showVideo: true,
      showExport: true,
      showImageEditor: true,
      showVideoEditor: true,
      showGallery: true,
      showPageLinkCopy: true,
      showWindowResize: true,
      showSettings: true,
    },
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultViewportPresetId: 'native',
    imageFormat: 'png',
    imageQuality: 100,
    presets: [],
    saveCapturesToGallery: false,
    viewportPresets: [],
  });
  getContextMenuVideoPresetAvailabilityMock.mockResolvedValue({
    status: 'requires-start-validation',
    presetId: 'preset-1',
    target: 'window',
    required: { width: 1280, height: 720 },
  });
  getViewportPresetErrorMessageMock.mockReturnValue(null);
  showContextMenuToastMock.mockResolvedValue(undefined);
  startContextMenuExportMock.mockResolvedValue(undefined);
  startContextMenuVideoRecordingMock.mockResolvedValue(undefined);
}

beforeEach(resetContextMenuActionCoverageMocks);

it('routes screenshot and non-preset video actions through their existing owners', async () => {
  const deps = createDeps();

  await handleBackgroundContextMenuAction({
    deps,
    menuId: CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
    tab: createTab(),
  });
  await handleBackgroundContextMenuAction({
    deps,
    menuId: CONTEXT_MENU_VIDEO_TAB_ID,
    tab: createTab(),
  });
  await handleBackgroundContextMenuAction({
    deps,
    menuId: CONTEXT_MENU_VIDEO_AREA_ID,
    tab: createTab(),
  });
  await handleBackgroundContextMenuAction({
    deps,
    menuId: CONTEXT_MENU_VIDEO_WINDOW_ID,
    tab: createTab(),
  });
  await handleBackgroundContextMenuAction({
    deps,
    menuId: CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
    tab: createTab(),
  });

  expect(enableScreenshotModeMock).toHaveBeenCalledWith(
    9,
    deps.screenshotModeState,
    deps.viewportState,
    deps.viewportOwnerState
  );
  expect(startContextMenuVideoRecordingMock).toHaveBeenNthCalledWith(1, 9, CaptureMode.TAB);
  expect(startContextMenuVideoRecordingMock).toHaveBeenNthCalledWith(2, 9, CaptureMode.TAB_CROP);
  expect(startContextMenuVideoRecordingMock).toHaveBeenNthCalledWith(3, 9, CaptureMode.SCREEN);
  expect(copyContextMenuExportPreviewMock).toHaveBeenCalledWith(9, 'markdown');
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledTimes(4);
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenNthCalledWith(1, 9);
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenNthCalledWith(2, 9);
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenNthCalledWith(3, 9);
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenNthCalledWith(4, 9);
});

it('requires an active tab id for tab-bound actions and quick actions', async () => {
  await expect(
    handleBackgroundContextMenuAction({
      deps: createDeps(),
      menuId: CONTEXT_MENU_VIDEO_TAB_ID,
      tab: {} as chrome.tabs.Tab,
    })
  ).rejects.toThrow();

  await expect(
    handleBackgroundContextMenuQuickAction({
      actionId: 'qa-1',
      deps: createDeps(),
      tab: {} as chrome.tabs.Tab,
    })
  ).rejects.toThrow();
});

it('passes quick actions through with the provided tab object', async () => {
  const { handleQuickAction } = await import('../../capture/quick-actions');
  const tab = createTab('https://resolved.example', 12);

  await handleBackgroundContextMenuQuickAction({
    actionId: 'qa-2',
    deps: createDeps(),
    tab,
  });

  expect(browserTabsGetMock).not.toHaveBeenCalled();
  expect(handleQuickAction).toHaveBeenCalledWith(
    expect.objectContaining({
      actionId: 'qa-2',
      tab,
    })
  );
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(12);
});

it('shows error feedback on tabs and logs when no active tab is available', async () => {
  await showBackgroundContextMenuError({
    error: new Error('boom'),
    tab: createTab(),
  });
  await showBackgroundContextMenuError({
    error: new Error('no-tab'),
    tab: {} as chrome.tabs.Tab,
  });

  expect(showContextMenuToastMock).toHaveBeenCalledWith(
    9,
    expect.objectContaining({
      message: 'boom',
      type: 'error',
    })
  );
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Context menu action failed without an active tab',
    expect.any(Error)
  );
});

it('uses localized viewport availability feedback instead of raw reason codes', async () => {
  getViewportPresetErrorMessageMock.mockReturnValueOnce('Friendly unavailable message');

  await showBackgroundContextMenuError({
    error: new Error('window-too-large'),
    tab: createTab(),
  });

  expect(showContextMenuToastMock).toHaveBeenCalledWith(
    9,
    expect.objectContaining({ message: 'Friendly unavailable message', type: 'error' })
  );
});

it('logs a warning when showing the error toast itself fails', async () => {
  showContextMenuToastMock.mockRejectedValueOnce(new Error('toast-failed'));

  await showBackgroundContextMenuError({
    error: new Error('boom'),
    tab: createTab(),
  });

  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to show context menu error toast',
    expect.any(Error)
  );
});

it('reports whether a context-menu preset is currently resolvable', async () => {
  await expect(hasContextMenuVideoPreset(createTab())).resolves.toBe(true);

  getContextMenuVideoPresetAvailabilityMock.mockResolvedValueOnce({
    status: 'unavailable',
    presetId: 'preset-1',
    target: 'window',
    reason: 'viewport-too-large',
  });

  await expect(hasContextMenuVideoPreset(createTab())).resolves.toBe(false);

  getContextMenuVideoPresetAvailabilityMock.mockRejectedValueOnce(new Error('query-failed'));

  await expect(hasContextMenuVideoPreset(createTab())).resolves.toBe(false);
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to query context-menu video preset availability',
    expect.any(Error)
  );
});

it('does not query preset availability without a supported active tab', async () => {
  await expect(hasContextMenuVideoPreset()).resolves.toBe(false);
  await expect(hasContextMenuVideoPreset(createTab('chrome://settings'))).resolves.toBe(false);

  expect(getContextMenuVideoPresetAvailabilityMock).not.toHaveBeenCalled();
});
