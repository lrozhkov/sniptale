import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const {
  captureSurfaceGetAvailabilityMock,
  loadPopupExportPreferencesMock,
  loadSettingsMock,
  loadVideoSettingsMock,
  loadVideoUiStateMock,
  openGalleryPageMock,
  openImageEditorPageMock,
  openSettingsPageMock,
  openVideoEditorPageMock,
  sendTabMessageMock,
  startRecordingMock,
  startPagePackageJobMock,
  browserPermissionsRequestMock,
  browserTabsGetMock,
  runtimeGetUrlMock,
  translateMock,
} = vi.hoisted(() => ({
  captureSurfaceGetAvailabilityMock: vi.fn(),
  loadPopupExportPreferencesMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loadVideoSettingsMock: vi.fn(),
  loadVideoUiStateMock: vi.fn(),
  openGalleryPageMock: vi.fn(),
  openImageEditorPageMock: vi.fn(),
  openSettingsPageMock: vi.fn(),
  openVideoEditorPageMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  startRecordingMock: vi.fn(),
  startPagePackageJobMock: vi.fn(),
  browserPermissionsRequestMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  runtimeGetUrlMock: vi.fn((path: string) => `chrome-extension://test/${path}`),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../capture-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture-surface')>()),
  getCaptureSurfaceService: vi.fn(() => ({
    getAvailability: captureSurfaceGetAvailabilityMock,
  })),
}));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openGalleryPage: openGalleryPageMock,
  openImageEditorPage: openImageEditorPageMock,
  openSettingsPage: openSettingsPageMock,
  openVideoEditorPage: openVideoEditorPageMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../../../platform/runtime-messaging', async () => {
  const actual = await vi.importActual('../../../platform/runtime-messaging');
  return {
    ...actual,
    sendTabMessage: sendTabMessageMock,
  };
});

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: runtimeGetUrlMock,
  },
}));

vi.mock('../../../composition/persistence/popup-export-preferences', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/popup-export-preferences')
  >()),
  loadPopupExportPreferences: loadPopupExportPreferencesMock,
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: loadVideoSettingsMock,
  loadVideoUiState: loadVideoUiStateMock,
}));

vi.mock('../../media/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media/lifecycle')>()),
  startRecording: startRecordingMock,
}));

vi.mock('../../capture/page-package/job', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/page-package/job')>()),
  startPagePackageJob: startPagePackageJobMock,
}));

vi.mock('@sniptale/platform/browser/permissions', () => ({
  browserPermissions: { request: browserPermissionsRequestMock },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGetMock },
}));

import {
  copyContextMenuExportPreview,
  handlePageContextMenuAction,
  isTabBoundContextMenuAction,
  resolveContextMenuVideoPreset,
  showContextMenuToast,
  startContextMenuExport,
  startContextMenuVideoRecording,
} from './action-helpers';
import {
  CONTEXT_MENU_EXPORT_COPY_JSON_ID,
  CONTEXT_MENU_GALLERY_ID,
  CONTEXT_MENU_IMAGE_EDITOR_ID,
  CONTEXT_MENU_SETTINGS_ID,
  CONTEXT_MENU_VIDEO_EDITOR_ID,
} from './constants';
import { CONTEXT_MENU_PAGE_LINK_RICH_ID } from './page-link/constants';
import {
  contextMenuPopupExportPreferencesFixture,
  contextMenuSettingsFixture,
  contextMenuVideoSettingsFixture,
} from './test-fixtures';

function resetContextMenuActionHelperMocks(): void {
  vi.clearAllMocks();
  loadPopupExportPreferencesMock.mockResolvedValue(contextMenuPopupExportPreferencesFixture);
  loadSettingsMock.mockResolvedValue(contextMenuSettingsFixture);
  loadVideoSettingsMock.mockResolvedValue(contextMenuVideoSettingsFixture);
  loadVideoUiStateMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    viewportPresetId: 'preset-alt',
  });
  captureSurfaceGetAvailabilityMock.mockImplementation(({ presetId }: { presetId: string }) =>
    Promise.resolve({
      status: 'requires-start-validation',
      presetId,
      target: 'window',
      required: { width: 1920, height: 1080 },
    })
  );
  sendTabMessageMock.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  startRecordingMock.mockResolvedValue(undefined);
  startPagePackageJobMock.mockResolvedValue({ phase: 'running' });
  browserPermissionsRequestMock.mockResolvedValue(true);
  browserTabsGetMock.mockResolvedValue({ id: 15, title: 'Example tab' });
}

beforeEach(resetContextMenuActionHelperMocks);

it('sends tab toasts through the shared tab messaging seam', async () => {
  await showContextMenuToast(17, {
    message: 'toast-message',
    title: 'toast-title',
    type: 'warning',
  });

  expect(sendTabMessageMock).toHaveBeenCalledWith(17, {
    payload: {
      message: 'toast-message',
      title: 'toast-title',
      type: 'warning',
    },
    type: MessageType.SHOW_TOAST,
  });
});

it('does not fall back to the retired global viewport default', async () => {
  loadVideoUiStateMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    viewportPresetId: 'missing-preset',
  });
  await expect(resolveContextMenuVideoPreset(contextMenuSettingsFixture)).resolves.toBeNull();
});

it('returns null when the explicit video preset cannot be resolved', async () => {
  loadVideoUiStateMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    viewportPresetId: 'missing-preset',
  });
  await expect(
    resolveContextMenuVideoPreset({
      ...contextMenuSettingsFixture,
      defaultViewportPresetId: 'missing-default',
    })
  ).resolves.toBeNull();
});

it('rejects a disabled explicit video preset', async () => {
  const settings = {
    ...contextMenuSettingsFixture,
    viewportPresets: contextMenuSettingsFixture.viewportPresets.map((preset) => ({
      ...preset,
      enabled: preset.id !== 'preset-alt',
    })),
  };

  await expect(resolveContextMenuVideoPreset(settings)).resolves.toBeNull();

  await expect(
    resolveContextMenuVideoPreset({
      ...settings,
      viewportPresets: settings.viewportPresets.map((preset) => ({ ...preset, enabled: false })),
    })
  ).resolves.toBeNull();
});

it('starts non-preset video recording without a viewport preset payload', async () => {
  await startContextMenuVideoRecording(21, CaptureMode.TAB);
  expect(startRecordingMock).toHaveBeenCalledWith(
    21,
    contextMenuVideoSettingsFixture,
    CaptureMode.TAB,
    null,
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );
});

it('throws a translated error when preset recording has no resolvable preset', async () => {
  loadSettingsMock.mockResolvedValue({
    ...contextMenuSettingsFixture,
    defaultViewportPresetId: 'missing-default',
  });
  loadVideoUiStateMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    viewportPresetId: 'missing-preset',
  });
  await expect(startContextMenuVideoRecording(21, CaptureMode.TAB, true)).rejects.toThrow(
    'popup.video.choosePresetError'
  );
});

it('rechecks physical preset availability immediately before recording', async () => {
  await startContextMenuVideoRecording(21, CaptureMode.TAB, true);

  expect(captureSurfaceGetAvailabilityMock).toHaveBeenCalledWith({
    tabId: 21,
    presetId: 'preset-alt',
    context: 'video-tab',
  });
  expect(startRecordingMock).toHaveBeenCalledWith(
    21,
    contextMenuVideoSettingsFixture,
    CaptureMode.TAB,
    'preset-alt',
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );
});

it('blocks an unavailable context-menu preset before recording starts', async () => {
  captureSurfaceGetAvailabilityMock.mockResolvedValueOnce({
    status: 'unavailable',
    presetId: 'preset-alt',
    target: 'window',
    reason: 'viewport-too-large',
    required: { width: 1920, height: 1080 },
    available: { width: 1280, height: 720 },
  });

  await expect(startContextMenuVideoRecording(21, CaptureMode.TAB, true)).rejects.toMatchObject({
    code: 'viewport-too-large',
  });
  expect(startRecordingMock).not.toHaveBeenCalled();
});

it('fails export start when the background job owner rejects', async () => {
  startPagePackageJobMock.mockRejectedValue(new Error('export-failed'));
  await expect(startContextMenuExport(15)).rejects.toThrow('export-failed');
});

it('starts export with the full persisted popup export selection', async () => {
  await startContextMenuExport(15);

  expect(startPagePackageJobMock).toHaveBeenCalledWith({
    contentPort: expect.objectContaining({
      cancelPagePackage: expect.any(Function),
      requestPagePackage: expect.any(Function),
    }),
    includeWebCopy: false,
    intent: 'export',
    jobId: expect.any(String),
    orderedTabs: [{ tabId: 15, title: 'Example tab' }],
    options: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
    },
    warnings: [],
  });
});

it('never acquires extended page evidence from context-menu Export', async () => {
  loadPopupExportPreferencesMock.mockResolvedValueOnce({
    ...contextMenuPopupExportPreferencesFixture,
    includePageDiagnostics: true,
  });

  await startContextMenuExport(15);

  expect(startPagePackageJobMock).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({ includePageDiagnostics: false }),
    })
  );
});

it('normalizes an oversized browser title before direct job admission', async () => {
  browserTabsGetMock.mockResolvedValueOnce({ id: 15, title: '\ud83d\ude00'.repeat(2_000) });

  await startContextMenuExport(15);

  const args = startPagePackageJobMock.mock.calls[0]![0];
  expect(new TextEncoder().encode(args.orderedTabs[0]!.title).byteLength).toBeLessThanOrEqual(
    2 * 1024
  );
});

it('copies markdown preview text and shows success feedback', async () => {
  sendTabMessageMock
    .mockResolvedValueOnce({
      preview: {
        context: 'ctx',
        jsonPreview: '{"ok":true}',
        markdownPreview: '# ok',
        rowsCount: 1,
        sectionsCount: 1,
        title: 'Preview',
      },
      success: true,
    })
    .mockResolvedValueOnce({ success: true })
    .mockResolvedValueOnce({ success: true });

  await copyContextMenuExportPreview(4, 'markdown');

  expect(sendTabMessageMock).toHaveBeenNthCalledWith(1, 4, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(sendTabMessageMock).toHaveBeenNthCalledWith(2, 4, {
    text: '# ok',
    type: MessageType.COPY_TEXT_TO_CLIPBOARD,
  });
  expect(sendTabMessageMock).toHaveBeenNthCalledWith(
    3,
    4,
    expect.objectContaining({
      payload: expect.objectContaining({
        message: 'popup.export.copied',
        title: 'popup.export.copyMarkdownButton',
        type: 'success',
      }),
      type: MessageType.SHOW_TOAST,
    })
  );
});

it('throws a translated error when preview generation fails before copy', async () => {
  sendTabMessageMock.mockResolvedValue({
    error: '',
    success: false,
  });

  await expect(copyContextMenuExportPreview(4, 'json')).rejects.toThrow(
    'popup.export.prepareExportError'
  );
});

it('opens each page-backed menu item through the shared extension-page helper', async () => {
  await expect(handlePageContextMenuAction(CONTEXT_MENU_IMAGE_EDITOR_ID)).resolves.toBe(true);
  await expect(handlePageContextMenuAction(CONTEXT_MENU_VIDEO_EDITOR_ID)).resolves.toBe(true);
  await expect(handlePageContextMenuAction(CONTEXT_MENU_GALLERY_ID)).resolves.toBe(true);
  await expect(handlePageContextMenuAction(CONTEXT_MENU_SETTINGS_ID)).resolves.toBe(true);
  await expect(handlePageContextMenuAction('sniptale.unknown')).resolves.toBe(false);

  expect(openImageEditorPageMock).toHaveBeenCalledOnce();
  expect(openVideoEditorPageMock).toHaveBeenCalledOnce();
  expect(openGalleryPageMock).toHaveBeenCalledOnce();
  expect(openSettingsPageMock).toHaveBeenCalledOnce();
});

it('recognizes tab-bound context menu action ids', () => {
  expect(isTabBoundContextMenuAction(CONTEXT_MENU_EXPORT_COPY_JSON_ID)).toBe(true);
  expect(isTabBoundContextMenuAction(CONTEXT_MENU_PAGE_LINK_RICH_ID)).toBe(true);
  expect(isTabBoundContextMenuAction('sniptale.not-tab-bound')).toBe(false);
});
