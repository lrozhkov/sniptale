// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';

const mockSendRuntimeMessage = vi.fn();
const mockLoadSettings = vi.fn();
const mockLoadEditorExportSettings = vi.fn();
const mockRenderToDataUrl = vi.fn();

const controller = {
  exportDocument: vi.fn(),
  renderToDataUrl: mockRenderToDataUrl,
};

function createEditorDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,doc',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: mockSendRuntimeMessage,
}));

vi.mock('../../persistence/export-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/export-settings')>()),

  loadEditorExportSettings: mockLoadEditorExportSettings,
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: mockLoadSettings,
}));

let editorFileSave: typeof import('./save');

beforeAll(async () => {
  editorFileSave = await import('./save');
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/editor?assetId=asset-1&session=session-1');
  mockLoadSettings.mockResolvedValue({
    defaultImagePresetId: 'preset-default',
    presets: [
      { enabled: true, id: 'preset-default', name: 'Team', order: 0, path: 'team' },
      { enabled: false, id: 'preset-disabled', name: 'Disabled', order: 1, path: 'disabled' },
    ],
  });
  mockLoadEditorExportSettings.mockResolvedValue({
    imageFormat: 'webp',
    imageQuality: 0.92,
  });
  mockRenderToDataUrl.mockReturnValue('data:image/png;base64,abc');
  mockSendRuntimeMessage.mockResolvedValue({
    success: true,
    updateCapabilityToken: 'update-token-1',
  });
  controller.exportDocument.mockReturnValue(createEditorDocument());
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function captureSaveFailure(): Promise<unknown> {
  let caughtError: unknown;
  try {
    await editorFileSave.saveEditorRenderedImage(controller);
  } catch (error) {
    caughtError = error;
  }

  return caughtError;
}

it('throws a typed storage prompt error when gallery save fails', async () => {
  mockSendRuntimeMessage.mockResolvedValueOnce({
    success: true,
    updateCapabilityToken: 'update-token-1',
  });
  mockSendRuntimeMessage.mockResolvedValueOnce({
    error: 'Disk full',
    success: false,
  });

  const caughtError = await captureSaveFailure();

  expect(editorFileSave.isEditorStoragePromptError(caughtError)).toBe(true);
  expect((caughtError as Error).message).toBe('Disk full');
  expect(mockSendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    assetId: 'asset-1',
    editorSessionId: 'session-1',
    type: MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY,
  });
  expect(mockSendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    assetId: 'asset-1',
    dataUrl: 'data:image/png;base64,abc',
    editorSessionId: 'session-1',
    filename: undefined,
    type: MessageType.UPDATE_GALLERY_IMAGE_ASSET,
    updateCapabilityToken: 'update-token-1',
  });
});

it('throws a typed storage prompt error when gallery update capability is missing', async () => {
  mockSendRuntimeMessage.mockResolvedValueOnce({ success: true });

  const caughtError = await captureSaveFailure();

  expect(editorFileSave.isEditorStoragePromptError(caughtError)).toBe(true);
  expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1);
  expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
    assetId: 'asset-1',
    editorSessionId: 'session-1',
    type: MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY,
  });
});

it('uses execute-save for explicit save-as actions and keeps the save contract stable', async () => {
  mockSendRuntimeMessage.mockResolvedValue({ success: true });

  await editorFileSave.saveEditorRenderedImage(controller, {
    actionType: 'ask_system',
    filename: 'edited.png',
  });

  expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
    actionType: 'ask_system',
    dataUrl: 'data:image/png;base64,abc',
    filename: 'edited.png',
    presetId: undefined,
    type: MessageType.EXECUTE_SAVE,
  });
  expect(mockRenderToDataUrl).toHaveBeenCalledWith({
    format: 'webp',
    outputSize: undefined,
    quality: 0.92,
  });
});

it('passes the requested export output size into the render contract', async () => {
  await editorFileSave.saveEditorRenderedImage(controller, {
    outputSize: { width: 1600, height: 900 },
  });

  expect(mockRenderToDataUrl).toHaveBeenCalledWith({
    format: 'webp',
    outputSize: { height: 900, width: 1600 },
    quality: 0.92,
  });
});

it('posts an apply message to the scenario host in embed mode', async () => {
  const postMessageSpy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  window.history.replaceState({}, '', '/editor?embed=scenario');

  await editorFileSave.saveEditorRenderedImage(controller);

  expect(postMessageSpy).toHaveBeenCalledWith(
    {
      source: 'sniptale-editor-embed',
      type: 'scenario-apply',
      dataUrl: 'data:image/png;base64,abc',
      document: createEditorDocument(),
    },
    window.location.origin
  );
  expect(mockSendRuntimeMessage).not.toHaveBeenCalled();
});

it('loads editor save options from enabled presets only and keeps null defaults explicit', async () => {
  mockLoadSettings.mockResolvedValueOnce({
    defaultImagePresetId: undefined,
    presets: [
      { enabled: true, id: 'preset-default', name: 'Team', order: 0, path: 'team' },
      { enabled: false, id: 'preset-disabled', name: 'Disabled', order: 1, path: 'disabled' },
    ],
  });

  await expect(editorFileSave.loadEditorSaveOptions()).resolves.toEqual({
    defaultImagePresetId: null,
    presets: [{ enabled: true, id: 'preset-default', name: 'Team', order: 0, path: 'team' }],
  });
});
