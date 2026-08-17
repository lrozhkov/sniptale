import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  commandListener: null as ((command: string, tab?: chrome.tabs.Tab) => void) | null,
  enableScreenshotMode: vi.fn(),
  ensureActivePageAccessRuntime: vi.fn(),
  ensureNativeVisibleCaptureAuthority: vi.fn(),
  handleQuickAction: vi.fn(),
  loadScreenshotCaptureRuntimeContext: vi.fn(),
  openGalleryPage: vi.fn(),
  openImageEditorPage: vi.fn(),
  openScenarioEditorPage: vi.fn(),
  openVideoEditorPage: vi.fn(),
  selectAndCaptureDesktopQuickAction: vi.fn(),
  showContextMenuToast: vi.fn(),
  startContextMenuExport: vi.fn(),
  subscribeToCommand: vi.fn((listener: (command: string, tab?: chrome.tabs.Tab) => void) => {
    mocks.commandListener = listener;
    return vi.fn();
  }),
}));

vi.mock('@sniptale/platform/browser/commands', () => ({
  browserCommands: { subscribeToCommand: mocks.subscribeToCommand },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { query: vi.fn() },
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));
vi.mock('../../capture/quick-actions/flow/load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/quick-actions/flow/load')>()),
  loadScreenshotCaptureRuntimeContext: mocks.loadScreenshotCaptureRuntimeContext,
}));
vi.mock('../../capture/quick-actions/desktop/workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/quick-actions/desktop/workflow')>()),
  selectAndCaptureDesktopQuickAction: mocks.selectAndCaptureDesktopQuickAction,
}));
vi.mock('../../capture/routes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../capture/routes')>()),
  handleQuickAction: mocks.handleQuickAction,
}));
vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openGalleryPage: mocks.openGalleryPage,
  openImageEditorPage: mocks.openImageEditorPage,
  openScenarioEditorPage: mocks.openScenarioEditorPage,
  openVideoEditorPage: mocks.openVideoEditorPage,
}));
vi.mock('../../../features/tab-capabilities/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/tab-capabilities/runtime')>()),
  classifyTabRuntimeCapability: () => 'regular',
}));
vi.mock('../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/service')>()),
  ensureActivePageAccessRuntime: mocks.ensureActivePageAccessRuntime,
  ensureNativeVisibleCaptureAuthority: mocks.ensureNativeVisibleCaptureAuthority,
}));
vi.mock('../context-menu/action-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../context-menu/action-helpers')>()),
  showContextMenuToast: mocks.showContextMenuToast,
  startContextMenuExport: mocks.startContextMenuExport,
}));
vi.mock('../tab-mode-router-screenshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tab-mode-router-screenshot')>()),
  enableScreenshotMode: mocks.enableScreenshotMode,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import {
  extensionCommandIds,
  registerExtensionCommandListener,
  runExtensionCommand,
  type ExtensionCommandId,
} from '.';
import { createBackgroundRuntimeState } from '../../application/runtime-state';

const tab = { id: 42, title: 'Current tab', url: 'https://example.test/' } as chrome.tabs.Tab;
const state = createBackgroundRuntimeState();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.commandListener = null;
  mocks.enableScreenshotMode.mockResolvedValue(undefined);
  mocks.ensureActivePageAccessRuntime.mockResolvedValue(undefined);
  mocks.handleQuickAction.mockResolvedValue({ result: 'accepted' });
  mocks.loadScreenshotCaptureRuntimeContext.mockImplementation(async (config) => ({
    action: { id: 'command', ...config },
    afterCapture: config.afterCapture,
    captureMode: config.screenshotMode,
    delaySeconds: 0,
    imageFormat: config.imageFormat ?? 'png',
    imageQuality: 90,
    settings: {},
    viewportPresetId: null,
  }));
  mocks.selectAndCaptureDesktopQuickAction.mockResolvedValue({
    dataUrl: 'data:image/png;base64,frame',
    height: 720,
    requestId: 'request',
    reservationToken: 'reservation',
    status: 'selected',
    width: 1280,
  });
  mocks.showContextMenuToast.mockResolvedValue(undefined);
  mocks.startContextMenuExport.mockResolvedValue(undefined);
});

it('keeps the manifest command inventory exact, descriptive, and unassigned by default', () => {
  const manifest = JSON.parse(readFileSync('apps/extension/manifest.json', 'utf8')) as {
    default_locale?: string;
    commands: Record<string, { description: string; suggested_key?: unknown }>;
  };
  const localeMessages = ['en', 'ru'].map(
    (locale) =>
      JSON.parse(
        readFileSync(`apps/extension/public/_locales/${locale}/messages.json`, 'utf8')
      ) as Record<string, { message: string }>
  );

  expect(manifest.default_locale).toBe('en');
  expect(Object.keys(manifest.commands)).toEqual(extensionCommandIds);
  for (const { description } of Object.values(manifest.commands)) {
    const messageKey = /^__MSG_([a-z0-9_]+)__$/.exec(description)?.[1];
    expect(messageKey).toBeTruthy();
    for (const messages of localeMessages) {
      expect(messages[messageKey ?? '']?.message.length).toBeGreaterThanOrEqual(12);
    }
  }
  expect(Object.values(manifest.commands).every((command) => !('suggested_key' in command))).toBe(
    true
  );
});

describe('toolbar commands', () => {
  it.each([
    ['tools-open', undefined],
    ['tools-drawing', 'drawing'],
    ['tools-annotations', 'highlighter'],
    ['tools-quick-edit', 'quick-edit'],
    ['tools-design-review', 'design-review'],
    ['tools-video-recording', 'video-recording'],
  ] as const)('routes %s through the screenshot-mode owner', async (command, workingMode) => {
    await runExtensionCommand(command, state, tab);

    expect(mocks.ensureActivePageAccessRuntime).toHaveBeenCalledWith(42);
    expect(mocks.enableScreenshotMode).toHaveBeenCalledWith(
      42,
      expect.any(Map),
      expect.any(Map),
      expect.any(Map),
      expect.any(Map),
      workingMode === undefined ? {} : { workingMode }
    );
  });
});

describe('capture commands', () => {
  it.each([
    ['capture-visible', 'visible', 'download_default'],
    ['capture-full-page', 'full', 'download_default'],
    ['capture-selection', 'selection', 'download_default'],
    ['capture-visible-edit', 'visible', 'edit'],
    ['capture-visible-copy', 'visible', 'copy'],
    ['capture-desktop-edit', 'desktop', 'edit'],
  ] as const)('routes %s through the quick-action owner', async (command, mode, afterCapture) => {
    await runExtensionCommand(command, state, tab);

    expect(mocks.loadScreenshotCaptureRuntimeContext).toHaveBeenCalledWith(
      expect.objectContaining({ afterCapture, screenshotMode: mode })
    );
    expect(mocks.handleQuickAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: `command:${command}`,
        tab,
        tabId: 42,
      })
    );
    expect(mocks.selectAndCaptureDesktopQuickAction).toHaveBeenCalledTimes(
      mode === 'desktop' ? 1 : 0
    );
  });
});

it('exports with saved popup settings and opens each workspace page', async () => {
  await runExtensionCommand('export-current-tab', state, tab);
  await runExtensionCommand('open-library', state, tab);
  await runExtensionCommand('open-image-editor', state, tab);
  await runExtensionCommand('open-video-editor', state, tab);
  await runExtensionCommand('open-scenario-editor', state, tab);

  expect(mocks.startContextMenuExport).toHaveBeenCalledWith(42);
  expect(mocks.openGalleryPage).toHaveBeenCalledOnce();
  expect(mocks.openImageEditorPage).toHaveBeenCalledOnce();
  expect(mocks.openVideoEditorPage).toHaveBeenCalledOnce();
  expect(mocks.openScenarioEditorPage).toHaveBeenCalledOnce();
});

it('ignores undeclared events and surfaces known-command failures in the active tab', async () => {
  registerExtensionCommandListener(state);
  mocks.commandListener?.('not-a-sniptale-command', tab);
  expect(mocks.enableScreenshotMode).not.toHaveBeenCalled();

  mocks.enableScreenshotMode.mockRejectedValueOnce(new Error('Toolbar unavailable'));
  mocks.commandListener?.('tools-drawing' satisfies ExtensionCommandId, tab);

  await vi.waitFor(() =>
    expect(mocks.showContextMenuToast).toHaveBeenCalledWith(42, {
      message: 'background.runtime.commandFailed',
      title: 'common.states.error',
      type: 'error',
    })
  );
});
