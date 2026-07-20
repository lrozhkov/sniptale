import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
  CONTEXT_MENU_EXPORT_START_ID,
  CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
  CONTEXT_MENU_VIDEO_WINDOW_ID,
} from './constants';
import { CONTEXT_MENU_PAGE_LINK_RICH_ID } from './page-link/constants';

const {
  copyContextMenuExportPreviewMock,
  copyContextMenuPageLinkMock,
  enableScreenshotModeMock,
  ensureActivePageAccessRuntimeMock,
  ensureNativeVisibleCaptureAuthorityMock,
  handleQuickActionMock,
  runtimeGetUrlMock,
  startContextMenuExportMock,
  startContextMenuVideoRecordingMock,
} = vi.hoisted(() => ({
  copyContextMenuExportPreviewMock: vi.fn(),
  copyContextMenuPageLinkMock: vi.fn(),
  enableScreenshotModeMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  ensureNativeVisibleCaptureAuthorityMock: vi.fn(),
  handleQuickActionMock: vi.fn(),
  runtimeGetUrlMock: vi.fn((path: string) => `chrome-extension://test/${path}`),
  startContextMenuExportMock: vi.fn(),
  startContextMenuVideoRecordingMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: runtimeGetUrlMock,
  },
}));

vi.mock('../../capture/quick-actions', () => ({
  handleQuickAction: handleQuickActionMock,
}));

vi.mock('../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../page-access/service')>()),
  ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
  ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
}));

vi.mock('../tab-mode-router-screenshot', () => ({
  buildScreenshotModeStatusResponse: vi.fn(),
  cleanupScreenshotModeAfterNavigation: vi.fn(),
  disableScreenshotMode: vi.fn(),
  enableScreenshotMode: enableScreenshotModeMock,
  handleSetViewport: vi.fn(),
}));

vi.mock('./action-helpers', async () => {
  const actual = await vi.importActual<typeof import('./action-helpers')>('./action-helpers');
  return {
    ...actual,
    copyContextMenuExportPreview: copyContextMenuExportPreviewMock,
    startContextMenuExport: startContextMenuExportMock,
    startContextMenuVideoRecording: startContextMenuVideoRecordingMock,
  };
});

vi.mock('./page-link/actions', () => ({
  copyContextMenuPageLink: copyContextMenuPageLinkMock,
}));

import {
  handleBackgroundContextMenuAction,
  handleBackgroundContextMenuQuickAction,
} from './actions';

function createDeps() {
  return {
    captureGuardState: { isCapturing: false },
    screenshotModeState: new Map<number, boolean>(),
    viewportOwnerState: new Map<number, 'debugger' | 'viewer'>(),
    viewportState: new Map<number, { width: number; height: number } | null>(),
  };
}

function createRegularTab(id = 11): chrome.tabs.Tab {
  return { id, title: 'Tab title', url: 'https://example.test' } as chrome.tabs.Tab;
}

function createOwnedViewerTab(id = 11): chrome.tabs.Tab {
  return {
    id,
    title: 'Viewer',
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=snap-1',
  } as chrome.tabs.Tab;
}

function expectGuardBefore(sideEffect: ReturnType<typeof vi.fn>): void {
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(11);
  expect(ensureActivePageAccessRuntimeMock.mock.invocationCallOrder[0]!).toBeLessThan(
    sideEffect.mock.invocationCallOrder[0]!
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  copyContextMenuExportPreviewMock.mockResolvedValue(undefined);
  copyContextMenuPageLinkMock.mockResolvedValue(undefined);
  enableScreenshotModeMock.mockResolvedValue(undefined);
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  ensureNativeVisibleCaptureAuthorityMock.mockResolvedValue(undefined);
  handleQuickActionMock.mockResolvedValue(undefined);
  startContextMenuExportMock.mockResolvedValue(undefined);
  startContextMenuVideoRecordingMock.mockResolvedValue(undefined);
});

it('refreshes regular-page context-menu screenshot runtime before enabling screenshot mode', async () => {
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_SCREENSHOTS_PREPARE_ID,
    tab: createRegularTab(),
  });

  expectGuardBefore(enableScreenshotModeMock);
});

it('refreshes regular-page context-menu video runtime before tab/preset recording', async () => {
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_VIDEO_PRESET_ID,
    tab: createRegularTab(),
  });

  expectGuardBefore(startContextMenuVideoRecordingMock);
});

it('refreshes regular-page context-menu export and page-link runtime before copy side effects', async () => {
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_EXPORT_COPY_MARKDOWN_ID,
    tab: createRegularTab(),
  });
  expectGuardBefore(copyContextMenuExportPreviewMock);

  vi.clearAllMocks();
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  copyContextMenuPageLinkMock.mockResolvedValue(undefined);
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_PAGE_LINK_RICH_ID,
    tab: createRegularTab(),
  });

  expectGuardBefore(copyContextMenuPageLinkMock);
});

it('refreshes regular-page context-menu quick action runtime before dispatch', async () => {
  await handleBackgroundContextMenuQuickAction({
    actionId: 'qa-1',
    deps: createDeps(),
    tab: createRegularTab(),
  });

  expectGuardBefore(handleQuickActionMock);
  expect(handleQuickActionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      pageAccessPort: {
        ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
        ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
      },
    })
  );
});

it('keeps owned-viewer context-menu quick actions outside runtime refresh', async () => {
  await handleBackgroundContextMenuQuickAction({
    actionId: 'qa-viewer',
    deps: createDeps(),
    tab: createOwnedViewerTab(),
  });

  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(handleQuickActionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      pageAccessPort: {
        ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
        ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
      },
    })
  );
});

it('stops context-menu quick actions when runtime refresh fails', async () => {
  ensureActivePageAccessRuntimeMock.mockRejectedValueOnce(new Error('Page access required'));

  await expect(
    handleBackgroundContextMenuQuickAction({
      actionId: 'qa-1',
      deps: createDeps(),
      tab: createRegularTab(),
    })
  ).rejects.toThrow('Page access required');

  expect(handleQuickActionMock).not.toHaveBeenCalled();
});

it('stops context-menu page side effects when runtime refresh fails', async () => {
  ensureActivePageAccessRuntimeMock.mockRejectedValueOnce(new Error('Page access required'));

  await expect(
    handleBackgroundContextMenuAction({
      deps: createDeps(),
      menuId: CONTEXT_MENU_EXPORT_START_ID,
      tab: createRegularTab(),
    })
  ).rejects.toThrow('Page access required');

  expect(startContextMenuExportMock).not.toHaveBeenCalled();
});

it('keeps screen recording and owned viewer actions outside the page-access runtime guard', async () => {
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_VIDEO_WINDOW_ID,
    tab: createRegularTab(),
  });
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_EXPORT_START_ID,
    tab: createOwnedViewerTab(),
  });

  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(startContextMenuVideoRecordingMock).toHaveBeenCalledWith(11, CaptureMode.SCREEN);
  expect(startContextMenuExportMock).toHaveBeenCalledWith(11);
});
