import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const {
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
  runtimeGetUrlMock,
  translateMock,
} = vi.hoisted(() => ({
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
  runtimeGetUrlMock: vi.fn((path: string) => `chrome-extension://test/${path}`),
  translateMock: vi.fn((key: string) => key),
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
  sendTabMessageMock.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  startRecordingMock.mockResolvedValue(undefined);
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

it('falls back to the default video preset when ui state points to a missing preset', async () => {
  loadVideoUiStateMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    viewportPresetId: 'missing-preset',
  });
  await expect(resolveContextMenuVideoPreset(contextMenuSettingsFixture)).resolves.toEqual({
    height: 900,
    id: 'preset-default',
    label: 'Default',
    width: 1440,
  });
});

it('returns null when neither the ui state nor the default preset can be resolved', async () => {
  loadVideoUiStateMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    viewportPresetId: 'missing-preset',
  });
  await expect(
    resolveContextMenuVideoPreset({
      ...contextMenuSettingsFixture,
      defaultVideoPresetId: 'missing-default',
    })
  ).resolves.toBeNull();
});

it('starts non-preset video recording without a viewport preset payload', async () => {
  await startContextMenuVideoRecording(21, CaptureMode.TAB);
  expect(startRecordingMock).toHaveBeenCalledWith(
    21,
    contextMenuVideoSettingsFixture,
    CaptureMode.TAB,
    undefined,
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );
});

it('throws a translated error when preset recording has no resolvable preset', async () => {
  loadSettingsMock.mockResolvedValue({
    ...contextMenuSettingsFixture,
    defaultVideoPresetId: 'missing-default',
  });
  loadVideoUiStateMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    viewportPresetId: 'missing-preset',
  });
  await expect(startContextMenuVideoRecording(21, CaptureMode.VIEWPORT_EMULATION)).rejects.toThrow(
    'popup.video.choosePresetError'
  );
});

it('fails export start when the content flow returns an error', async () => {
  sendTabMessageMock.mockResolvedValue({
    error: 'export-failed',
    success: false,
  });
  await expect(startContextMenuExport(15)).rejects.toThrow('export-failed');
});

it('starts export with the full persisted popup export selection', async () => {
  await startContextMenuExport(15);

  expect(sendTabMessageMock).toHaveBeenNthCalledWith(1, 15, {
    options: {
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: true,
      includeFullPageScreenshot: false,
      includeHarDomLogs: false,
      includeImages: true,
      includeJson: true,
      includeMarkdown: true,
    },
    requestId: expect.any(String),
    type: MessageType.EXPORT_POPUP_START,
  });
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
