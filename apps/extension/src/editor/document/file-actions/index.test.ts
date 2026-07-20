// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';

const mockSendRuntimeMessage = vi.fn();
const mockLoadSettings = vi.fn();
const mockLoadEditorExportSettings = vi.fn();
const mockRenderToDataUrl = vi.fn();
const waitForEditorDocumentCanvasMock = vi.fn();
const logEditorDocumentOpenTraceMock = vi.fn();

const controller = {
  canvas: null,
  exportDocument: vi.fn(),
  insertImage: vi.fn(),
  loadDocument: vi.fn(),
  openImage: vi.fn(),
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

vi.mock('./canvas-ready', () => ({
  waitForEditorDocumentCanvas: waitForEditorDocumentCanvasMock,
}));

vi.mock('./open-trace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./open-trace')>()),
  logEditorDocumentOpenTrace: logEditorDocumentOpenTraceMock,
}));

let editorFileActions: typeof import('./');

beforeAll(async () => {
  editorFileActions = await import('./');
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
  waitForEditorDocumentCanvasMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function expectExecuteSaveMessage(overrides: Record<string, unknown>) {
  expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,abc',
    type: MessageType.EXECUTE_SAVE,
    ...overrides,
  });
}

describe('openEditorImageFromFile', () => {
  it('opens the selected image after the canvas becomes ready', async () => {
    const setImageData = vi.fn();
    const file = new File(['image-data'], 'capture.png', { type: 'image/png' });

    await editorFileActions.openEditorImageFromFile(controller, file, setImageData);

    expect(waitForEditorDocumentCanvasMock).toHaveBeenCalledWith(controller);
    expect(controller.openImage).toHaveBeenCalledWith(
      expect.stringContaining('data:image/png'),
      'capture.png'
    );
    expect(setImageData).toHaveBeenCalledWith(expect.stringContaining('data:image/png'));
    expect(logEditorDocumentOpenTraceMock).toHaveBeenCalledWith(
      'file:selected',
      expect.objectContaining({ name: 'capture.png' })
    );
    expect(logEditorDocumentOpenTraceMock).toHaveBeenCalledWith(
      'file:read',
      expect.objectContaining({ name: 'capture.png' })
    );
  });

  it('ignores empty file selection', async () => {
    const setImageData = vi.fn();

    await editorFileActions.openEditorImageFromFile(controller, undefined, setImageData);

    expect(waitForEditorDocumentCanvasMock).not.toHaveBeenCalled();
    expect(controller.openImage).not.toHaveBeenCalled();
    expect(setImageData).not.toHaveBeenCalled();
  });
});

describe('insertEditorImageFromFile', () => {
  it('inserts an image layer from a selected file', async () => {
    const file = new File(['image-data'], 'insert.png', { type: 'image/png' });

    await editorFileActions.insertEditorImageFromFile(controller, file);

    expect(controller.insertImage).toHaveBeenCalledWith(
      expect.stringContaining('data:image/png'),
      'insert.png'
    );
  });

  it('ignores empty file selection', async () => {
    await editorFileActions.insertEditorImageFromFile(controller, undefined);

    expect(controller.insertImage).not.toHaveBeenCalled();
  });
});

describe('exportEditorSession', () => {
  it('downloads the exported session document as JSON and revokes the URL asynchronously', () => {
    const originalCreateElement = document.createElement.bind(document);
    const clickMock = vi.fn();
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:session');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    controller.exportDocument.mockReturnValue({
      sourceImageData: 'data:image/png;base64,abc',
      version: 1,
    });
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', {
          configurable: true,
          value: clickMock,
        });
      }
      return element;
    });
    vi.useFakeTimers();

    editorFileActions.exportEditorSession(controller);

    expect(createObjectUrlSpy).toHaveBeenCalledOnce();
    expect(clickMock).toHaveBeenCalledOnce();
    expect(controller.exportDocument).toHaveBeenCalledOnce();
    expect(revokeObjectUrlSpy).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:session');
  });
});

describe('loadEditorSaveOptions', () => {
  it('keeps only enabled presets and resolves the default preset id', async () => {
    const options = await editorFileActions.loadEditorSaveOptions();

    expect(options).toEqual({
      defaultImagePresetId: 'preset-default',
      presets: [{ enabled: true, id: 'preset-default', name: 'Team', order: 0, path: 'team' }],
    });
  });
});

describe('saveEditorRenderedImage gallery failures', () => {
  it('throws a typed storage prompt error when gallery save fails', async () => {
    mockSendRuntimeMessage
      .mockResolvedValueOnce({ success: true, updateCapabilityToken: 'update-token-1' })
      .mockResolvedValueOnce({ error: 'Disk full', success: false });

    let caughtError: unknown;
    try {
      await editorFileActions.saveEditorRenderedImage(controller);
    } catch (error) {
      caughtError = error;
    }

    expect(editorFileActions.isEditorStoragePromptError(caughtError)).toBe(true);
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
  }, 20000);
});

describe('saveEditorRenderedImage save flows', () => {
  it('falls back to execute-save flow for explicit save-as actions', async () => {
    window.history.replaceState({}, '', '/editor?assetId=asset-1');
    mockSendRuntimeMessage.mockResolvedValue({ success: true });

    await editorFileActions.saveEditorRenderedImage(controller, {
      actionType: 'ask_system',
      filename: 'edited.png',
    });

    expectExecuteSaveMessage({
      actionType: 'ask_system',
      filename: 'edited.png',
      presetId: undefined,
    });
    expect(mockRenderToDataUrl).toHaveBeenCalledWith({
      format: 'webp',
      outputSize: undefined,
      quality: 0.92,
    });
  }, 20000);

  it('uses the default preset for regular download saves without an asset id', async () => {
    window.history.replaceState({}, '', '/editor');
    mockSendRuntimeMessage.mockResolvedValue({ success: true });

    await editorFileActions.saveEditorRenderedImage(controller);

    expectExecuteSaveMessage({
      actionType: 'download_default',
      filename: expect.any(String),
      presetId: 'preset-default',
    });
  });
});

it('posts an apply message to the scenario host in embed mode', async () => {
  const postMessageSpy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  window.history.replaceState({}, '', '/editor?embed=scenario');

  await editorFileActions.saveEditorRenderedImage(controller);

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
