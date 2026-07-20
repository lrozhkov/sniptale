import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeQuickActionCapture } from './finalize';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { Settings } from '../../../../contracts/settings';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';

const {
  clearViewport,
  createRenderedCaptureJob,
  detachDebugger,
  executeDownload,
  openEditorWithImage,
  transitionCaptureJob,
} = vi.hoisted(() => ({
  clearViewport: vi.fn(),
  createRenderedCaptureJob: vi.fn(),
  detachDebugger: vi.fn(),
  executeDownload: vi.fn(),
  openEditorWithImage: vi.fn(),
  transitionCaptureJob: vi.fn(),
}));

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/index')>()),
  translate: (key: string) => key,
}));

vi.mock('../../download/download-router/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../download/download-router/index')>()),
  executeDownload,
}));

vi.mock('../../editor/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../editor/index')>()),
  openEditorWithImage,
}));

vi.mock('../../jobs/rendered-job', () => ({
  createRenderedCaptureJob,
}));

vi.mock('../../../debugger/session/detach', () => ({
  detachDebugger,
}));

vi.mock('../../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../debugger/workspace')>()),
  clearViewport,
}));

vi.mock('../../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../jobs/state-machine')>()),
  transitionCaptureJob,
}));

vi.mock('../../../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging/index')>()),
  sendTabMessage: sendMessage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  createRenderedCaptureJob.mockResolvedValue('capture-job-quick-action');
  sendMessage.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendMessage });
  transitionCaptureJob.mockResolvedValue(undefined);
});

describe('capture quick action finalize copy flow', () => {
  it('shows a success toast for copy quick actions that exit after capture', async () => {
    await finalizeQuickActionCapture({
      action: createAction('copy-action', 'copy', 'copy'),
      captureResult: {
        dataUrl: 'data:image/png;base64,copy',
        filename: 'capture.png',
        needsDebugger: false,
      },
      settings: createSettings(),
      tabId: 7,
    });

    expect(sendMessage).toHaveBeenNthCalledWith(1, 7, {
      type: MessageType.COPY_IMAGE_TO_CLIPBOARD,
      dataUrl: 'data:image/png;base64,copy',
    });
    expect(sendMessage).toHaveBeenNthCalledWith(2, 7, {
      type: MessageType.SHOW_TOAST,
      payload: {
        type: 'success',
        message: 'content.runtime.quickActionCopiedToClipboard',
      },
    });
    expect(sendMessage).toHaveBeenNthCalledWith(3, 7, {
      type: MessageType.DESTROY_UI_TOOLBAR,
    });
  });
});

async function runQuickActionCapture(
  tabId: number,
  afterCapture: 'download_default' | 'ask_system' | 'scenario',
  dataUrl: string
) {
  await finalizeQuickActionCapture({
    action: createAction(`${afterCapture}-action`, afterCapture, afterCapture),
    captureResult: {
      dataUrl,
      filename: 'capture.png',
      needsDebugger: false,
    },
    settings: createSettings(
      afterCapture === 'download_default' ? { defaultImagePresetId: 'default-preset' } : undefined
    ),
    tabId,
  });
}

function expectSavedToast(tabId: number, callIndex: number) {
  expect(sendMessage).toHaveBeenNthCalledWith(callIndex, tabId, {
    type: MessageType.SHOW_TOAST,
    payload: {
      type: 'success',
      message: 'content.runtime.quickActionSaved',
    },
  });
}

describe('capture quick action finalize default download flow', () => {
  it('shows a success toast for download quick actions that exit after capture', async () => {
    await runQuickActionCapture(9, 'download_default', 'data:image/png;base64,download');

    expect(executeDownload).toHaveBeenCalledWith(
      'data:image/png;base64,download',
      'capture.png',
      'download_default',
      'default-preset',
      'capture-job-quick-action'
    );
    expectSavedToast(9, 1);
    expect(sendMessage).toHaveBeenNthCalledWith(2, 9, {
      type: MessageType.DESTROY_UI_TOOLBAR,
    });
  });
});

describe('capture quick action finalize edit flow', () => {
  it('does not show an extra toast for edit quick actions', async () => {
    await finalizeQuickActionCapture({
      action: createAction('edit-action', 'Edit', 'edit'),
      captureResult: {
        dataUrl: 'data:image/png;base64,edit',
        filename: 'capture.png',
        needsDebugger: false,
      },
      settings: createSettings(),
      tabId: 11,
    });

    expect(openEditorWithImage).toHaveBeenCalledWith('data:image/png;base64,edit', { tabId: 11 });
    expect(
      sendMessage.mock.calls.some(
        ([tabId, message]) => tabId === 11 && message.type === MessageType.SHOW_TOAST
      )
    ).toBe(false);
    expect(sendMessage).toHaveBeenLastCalledWith(11, {
      type: MessageType.DESTROY_UI_TOOLBAR,
    });
  });

  it('skips toolbar teardown when the action should keep the runtime active', async () => {
    await finalizeQuickActionCapture({
      action: {
        ...createAction('stay-open-action', 'Edit inline', 'edit'),
        exitAfterCapture: false,
      },
      captureResult: {
        dataUrl: 'data:image/png;base64,edit',
        filename: 'capture.png',
        needsDebugger: false,
      },
      settings: createSettings(),
      tabId: 12,
    });

    expect(openEditorWithImage).toHaveBeenCalledWith('data:image/png;base64,edit', { tabId: 12 });
    expect(
      sendMessage.mock.calls.some(
        ([tabId, message]) => tabId === 12 && message.type === MessageType.DESTROY_UI_TOOLBAR
      )
    ).toBe(false);
  });
});

describe('capture quick action finalize warning paths', () => {
  it('warns when showing the save dialog fails', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sendMessage.mockRejectedValueOnce(new Error('dialog failed'));

    await finalizeQuickActionCapture({
      action: createAction('save-dialog-action', 'Ask preset', 'ask_preset'),
      captureResult: {
        dataUrl: 'data:image/png;base64,dialog',
        filename: 'capture.png',
        needsDebugger: false,
      },
      settings: createSettings(),
      tabId: 13,
    });

    await Promise.resolve();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[BackgroundQuickAction]',
      'Failed to show save dialog',
      { tabId: 13 },
      expect.any(Error)
    );
  });

  it('warns when debugger cleanup fails after capture', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    clearViewport.mockRejectedValueOnce(new Error('cleanup failed'));

    await finalizeQuickActionCapture({
      action: createAction('download-debugger-action', 'Download', 'download_default'),
      captureResult: {
        dataUrl: 'data:image/png;base64,download',
        filename: 'capture.png',
        needsDebugger: true,
      },
      settings: createSettings(),
      tabId: 15,
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[BackgroundQuickAction]',
      'Failed to cleanup debugger',
      expect.any(Error)
    );
  });
});

function createAction(
  id: string,
  name: string,
  afterCapture: 'copy' | 'download_default' | 'edit' | 'ask_preset' | 'ask_system' | 'scenario'
) {
  return {
    afterCapture,
    exitAfterCapture: true,
    icon: afterCapture,
    id,
    name,
    screenshotMode: 'visible' as const,
    status: true,
  };
}

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
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
      showSettings: true,
    },
    imageFormat: 'png',
    imageQuality: 90,
    authenticatedSnapshotAssetsEnabled: true,
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    skipWebSnapshotSaveDisclosure: false,
    rawDiagnosticsEnabled: false,
    saveCapturesToGallery: false,
    ...overrides,
  };
}
