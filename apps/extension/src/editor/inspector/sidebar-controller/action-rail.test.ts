// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_EXPORT_FILENAME } from '@sniptale/ui/branding';
import type { Settings } from '../../../contracts/settings';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MAX_EDITOR_RASTER_IMAGE_FILE_BYTES } from '../../document/file-actions/raster-intake';

type SaveSettings = Pick<Settings, 'defaultImagePresetId'>;
type EditorExportSettings = Pick<Settings, 'imageFormat' | 'imageQuality'>;

const mocks = vi.hoisted(() => ({
  generateFilenameMock: vi.fn(() => 'edited-file.png'),
  loadSettingsMock: vi.fn<() => Promise<SaveSettings>>(async () => ({
    defaultImagePresetId: 'preset-1',
  })),
  loadEditorExportSettingsMock: vi.fn<() => Promise<EditorExportSettings>>(async () => ({
    imageFormat: 'webp',
    imageQuality: 0.92,
  })),
  sendRuntimeMessageMock: vi.fn(async () => ({ success: true })),
}));

vi.mock('../../persistence/export-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/export-settings')>()),

  loadEditorExportSettings: mocks.loadEditorExportSettingsMock,
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: mocks.loadSettingsMock,
}));

vi.mock('@sniptale/foundation/utils/filename', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/filename')>()),
  generateFilename: mocks.generateFilenameMock,
}));

import { createEditorActionRailHandlers } from './action-rail';

type EditorActionRailTestController = Parameters<typeof createEditorActionRailHandlers>[0];
type EditorInspectorActionClient = NonNullable<
  Parameters<typeof createEditorActionRailHandlers>[2]
>;

let readAsDataUrlCalls = 0;

class FileReaderMock {
  result: string | null = null;
  error: DOMException | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsDataURL(file: File) {
    readAsDataUrlCalls += 1;
    this.result = `data:${file.type};base64,${btoa(file.name)}`;
    this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>);
  }

  readAsText(file: File) {
    this.result = file.name === 'session.json' ? JSON.stringify(createEditorDocument()) : '';
    this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>);
  }
}

function createEditorDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,session',
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

function createController(): EditorActionRailTestController {
  return {
    exportDocument: vi.fn(() => createEditorDocument()),
    insertImage: vi.fn(async () => undefined),
    loadDocument: vi.fn(async () => undefined),
    openImage: vi.fn(async () => undefined),
    renderToDataUrl: vi.fn(() => 'data:image/png;base64,rendered'),
  };
}

function createActionClient(): EditorInspectorActionClient {
  const sendRuntimeMessage =
    mocks.sendRuntimeMessageMock as EditorInspectorActionClient['sendRuntimeMessage'];
  return {
    sendRuntimeMessage,
  };
}

function setupActionRailGlobals() {
  vi.clearAllMocks();
  readAsDataUrlCalls = 0;
  vi.stubGlobal('FileReader', FileReaderMock);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:session-export'),
    revokeObjectURL: vi.fn(),
  });
}

function runNoopSuite() {
  it('ignores undefined file selections for open, insert, and import actions', async () => {
    const controller = createController();
    const setImageData = vi.fn();
    const handlers = createEditorActionRailHandlers(controller, setImageData);

    await handlers.openImage(undefined);
    await handlers.insertImage(undefined);
    await handlers.importSession(undefined);

    expect(controller.openImage).not.toHaveBeenCalled();
    expect(controller.insertImage).not.toHaveBeenCalled();
    expect(controller.loadDocument).not.toHaveBeenCalled();
    expect(setImageData).not.toHaveBeenCalled();
  });
}

function runFileLoadSuite() {
  it('opens images, inserts overlays, and imports session files', async () => {
    const controller = createController();
    const setImageData = vi.fn();
    const handlers = createEditorActionRailHandlers(controller, setImageData);

    await handlers.openImage(new File(['image'], 'open.png', { type: 'image/png' }));
    await handlers.insertImage(new File(['overlay'], 'insert.png', { type: 'image/png' }));
    await handlers.importSession(
      new File(['session'], 'session.json', { type: 'application/json' })
    );

    expect(controller.openImage).toHaveBeenCalledWith(
      'data:image/png;base64,b3Blbi5wbmc=',
      'open.png'
    );
    expect(controller.insertImage).toHaveBeenCalledWith(
      'data:image/png;base64,aW5zZXJ0LnBuZw==',
      'insert.png'
    );
    expect(controller.loadDocument).toHaveBeenCalledWith(createEditorDocument());
    expect(setImageData).toHaveBeenCalledWith('data:image/png;base64,b3Blbi5wbmc=');
    expect(setImageData).toHaveBeenCalledWith('data:image/png;base64,session');
  });

  it('rejects bad raster image selections before file read and controller mutation', async () => {
    const controller = createController();
    const handlers = createEditorActionRailHandlers(controller, vi.fn());
    const oversizedFile = new File(['image'], 'oversized.png', { type: 'image/png' });

    Object.defineProperty(oversizedFile, 'size', {
      value: MAX_EDITOR_RASTER_IMAGE_FILE_BYTES + 1,
    });

    await expect(handlers.openImage(oversizedFile)).rejects.toThrow(
      'Invalid editor raster image file'
    );
    await expect(
      handlers.insertImage(new File(['text'], 'notes.txt', { type: 'text/plain' }))
    ).rejects.toThrow('Invalid editor raster image file');

    expect(readAsDataUrlCalls).toBe(0);
    expect(controller.openImage).not.toHaveBeenCalled();
    expect(controller.insertImage).not.toHaveBeenCalled();
  });
}

function runExportAndSaveSuite() {
  it('exports the current session and delegates rendered image saves to runtime messaging', async () => {
    const controller = createController();
    const handlers = createEditorActionRailHandlers(controller, vi.fn(), createActionClient());
    const link = document.createElement('a');
    const clickSpy = vi.spyOn(link, 'click').mockImplementation(() => {});
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(link);

    handlers.exportSession();
    await handlers.saveRenderedImage();

    expect(link.download).toBe(SESSION_EXPORT_FILENAME);
    expect(link.href).toBe('blob:session-export');
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:session-export');
    expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith({
      actionType: 'download_default',
      dataUrl: 'data:image/png;base64,rendered',
      filename: 'edited-file.png',
      presetId: 'preset-1',
      type: MessageType.EXECUTE_SAVE,
    });
    expect(controller.renderToDataUrl).toHaveBeenCalledWith({
      format: 'webp',
      quality: 0.92,
    });
    expect(createElementSpy).toHaveBeenCalledWith('a');
  });

  it('omits the preset id when rendered-image saves have no default preset', async () => {
    mocks.loadSettingsMock.mockResolvedValueOnce({
      defaultImagePresetId: null,
    });

    const handlers = createEditorActionRailHandlers(
      createController(),
      vi.fn(),
      createActionClient()
    );

    await handlers.saveRenderedImage();

    expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith({
      actionType: 'download_default',
      dataUrl: 'data:image/png;base64,rendered',
      filename: 'edited-file.png',
      type: MessageType.EXECUTE_SAVE,
    });
  });
}

describe('editor-action-rail handlers', () => {
  beforeEach(setupActionRailGlobals);
  runNoopSuite();
  runFileLoadSuite();
  runExportAndSaveSuite();
});
