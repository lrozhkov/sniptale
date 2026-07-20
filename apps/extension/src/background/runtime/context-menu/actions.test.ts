import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  handleBackgroundContextMenuAction,
  handleBackgroundContextMenuQuickAction,
} from './actions';
import {
  CONTEXT_MENU_EXPORT_COPY_JSON_ID,
  CONTEXT_MENU_EXPORT_START_ID,
  CONTEXT_MENU_SETTINGS_ID,
  CONTEXT_MENU_VIDEO_PRESET_ID,
} from './constants';
import {
  CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID,
  CONTEXT_MENU_PAGE_LINK_RICH_ID,
} from './page-link/constants';
import {
  contextMenuPopupExportPreferencesFixture,
  contextMenuSettingsFixture,
  contextMenuVideoSettingsFixture,
} from './test-fixtures';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';

const {
  browserScriptingExecuteScriptMock,
  ensureActivePageAccessRuntimeMock,
  handleQuickActionMock,
  loadPopupExportPreferencesMock,
  loadSettingsMock,
  loadVideoSettingsMock,
  loadVideoUiStateMock,
  openSettingsPageMock,
  runtimeGetUrlMock,
  sendTabMessageMock,
  startRecordingMock,
} = vi.hoisted(() => ({
  browserScriptingExecuteScriptMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  handleQuickActionMock: vi.fn(),
  loadPopupExportPreferencesMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loadVideoSettingsMock: vi.fn(),
  loadVideoUiStateMock: vi.fn(),
  openSettingsPageMock: vi.fn(),
  runtimeGetUrlMock: vi.fn((path: string) => `chrome-extension://test/${path}`),
  sendTabMessageMock: vi.fn(),
  startRecordingMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/scripting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/scripting')>()),
  browserScripting: {
    executeScript: browserScriptingExecuteScriptMock,
  },
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: runtimeGetUrlMock,
  },
}));

vi.mock('../../capture/routes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/routes')>()),
  handleQuickAction: handleQuickActionMock,
}));

vi.mock('../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../page-access/service')>()),
  ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
}));

vi.mock('../../media/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media/lifecycle')>()),
  startRecording: startRecordingMock,
}));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openGalleryPage: vi.fn(),
  openImageEditorPage: vi.fn(),
  openSettingsPage: openSettingsPageMock,
  openVideoEditorPage: vi.fn(),
}));

vi.mock('../../../platform/runtime-messaging', async () => {
  const actual = await vi.importActual('../../../platform/runtime-messaging');
  return {
    ...actual,
    sendTabMessage: sendTabMessageMock,
  };
});

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

function createDeps() {
  return {
    captureGuardState: { isCapturing: false },
    screenshotModeState: new Map<number, boolean>(),
    viewportOwnerState: new Map<number, 'debugger' | 'viewer'>(),
    viewportState: new Map<number, { width: number; height: number } | null>(),
  };
}

function createTab(url = 'https://example.test', id = 11): chrome.tabs.Tab {
  return { id, title: 'Tab title', url } as chrome.tabs.Tab;
}

function seedContextMenuActionMocks() {
  vi.clearAllMocks();
  loadSettingsMock.mockResolvedValue({
    ...contextMenuSettingsFixture,
    defaultVideoPresetId: 'preset-2',
    viewportPresets: [
      { id: 'preset-1', width: 1280, height: 720, label: 'HD' },
      { id: 'preset-2', width: 1920, height: 1080, label: 'Full HD' },
    ],
  });
  loadVideoSettingsMock.mockResolvedValue(contextMenuVideoSettingsFixture);
  loadVideoUiStateMock.mockResolvedValue({
    captureMode: CaptureMode.TAB,
    viewportPresetId: 'preset-1',
  });
  loadPopupExportPreferencesMock.mockResolvedValue(contextMenuPopupExportPreferencesFixture);
  sendTabMessageMock.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
  browserScriptingExecuteScriptMock.mockResolvedValue([{ frameId: 0, result: 'Meta title' }]);
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
}

async function verifyPresetRecordingRouting() {
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_VIDEO_PRESET_ID,
    tab: createTab(),
  });

  expect(startRecordingMock).toHaveBeenCalledWith(
    11,
    expect.any(Object),
    CaptureMode.VIEWPORT_EMULATION,
    expect.objectContaining({ id: 'preset-1', width: 1280, height: 720 }),
    'chrome-extension://test/apps/extension/src/popup/index.html'
  );
}

async function verifyExportStartRouting() {
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_EXPORT_START_ID,
    tab: createTab(),
  });

  expect(sendTabMessageMock).toHaveBeenNthCalledWith(1, 11, {
    options: contextMenuPopupExportPreferencesFixture,
    requestId: expect.any(String),
    type: MessageType.EXPORT_POPUP_START,
  });
}

async function verifyJsonCopyRouting() {
  sendTabMessageMock
    .mockResolvedValueOnce({
      success: true,
      preview: {
        context: 'ctx',
        jsonPreview: '{"ok":true}',
        markdownPreview: '# ok',
        rowsCount: 1,
        sectionsCount: 1,
        title: 'Preview',
      },
    })
    .mockResolvedValueOnce({ success: true })
    .mockResolvedValueOnce({ success: true });

  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_EXPORT_COPY_JSON_ID,
    tab: createTab(),
  });

  expect(sendTabMessageMock).toHaveBeenNthCalledWith(1, 11, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(sendTabMessageMock).toHaveBeenNthCalledWith(2, 11, {
    type: MessageType.COPY_TEXT_TO_CLIPBOARD,
    text: '{"ok":true}',
  });
  expect(sendTabMessageMock).toHaveBeenNthCalledWith(
    3,
    11,
    expect.objectContaining({ type: MessageType.SHOW_TOAST })
  );
}

async function verifyRichPageLinkCopyRouting() {
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_PAGE_LINK_RICH_ID,
    tab: createTab('https://example.test/path?x=1'),
  });

  expect(sendTabMessageMock).toHaveBeenNthCalledWith(1, 11, {
    html: '<a href="https://example.test/path?x=1">Meta title</a>',
    text: 'Meta title\nhttps://example.test/path?x=1',
    type: MessageType.COPY_TEXT_TO_CLIPBOARD,
  });
  expect(sendTabMessageMock).toHaveBeenNthCalledWith(
    2,
    11,
    expect.objectContaining({ type: MessageType.SHOW_TOAST })
  );
}

async function verifyMarkdownPageLinkTitleFallback() {
  browserScriptingExecuteScriptMock.mockRejectedValueOnce(new Error('metadata unavailable'));

  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_PAGE_LINK_MARKDOWN_ID,
    pageUrl: 'https://fallback.example/page',
    tab: createTab('', 12),
  });

  expect(sendTabMessageMock).toHaveBeenNthCalledWith(1, 12, {
    text: '[Tab title](https://fallback.example/page)',
    type: MessageType.COPY_TEXT_TO_CLIPBOARD,
  });
}

async function verifySettingsPageRouting() {
  await handleBackgroundContextMenuAction({
    deps: createDeps(),
    menuId: CONTEXT_MENU_SETTINGS_ID,
  });

  expect(openSettingsPageMock).toHaveBeenCalledOnce();
}

async function verifyQuickActionRouting() {
  await handleBackgroundContextMenuQuickAction({
    actionId: 'default-edit-visible',
    deps: createDeps(),
    tab: createTab(),
  });

  expect(handleQuickActionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      actionId: 'default-edit-visible',
      tabId: 11,
    })
  );
}

describe('context menu actions', () => {
  beforeEach(seedContextMenuActionMocks);

  it(
    'routes preset recording through the existing video start flow with the resolved preset',
    verifyPresetRecordingRouting
  );
  it('starts export with the persisted popup export preferences', verifyExportStartRouting);
  it(
    'copies JSON preview through the clipboard text tab message and shows feedback',
    verifyJsonCopyRouting
  );
  it('copies page links as rich HTML with a plain-text fallback', verifyRichPageLinkCopyRouting);
  it(
    'falls back to tab title and pageUrl for Markdown page-link copies',
    verifyMarkdownPageLinkTitleFallback
  );
  it('opens settings through the shared extension page helper', verifySettingsPageRouting);
  it(
    'routes quick action menu items through the existing quick action handler',
    verifyQuickActionRouting
  );
});
