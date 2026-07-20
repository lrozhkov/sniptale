// @vitest-environment jsdom

import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import { translate } from '../../../platform/i18n';
import type {
  EditorDocumentExportPort,
  EditorDocumentInsertImagePort,
  EditorDocumentOpenPort,
} from './ports';

const waitForEditorDocumentCanvasMock = vi.fn();
const logEditorDocumentOpenTraceMock = vi.fn();

type ImportEditorSessionController = EditorDocumentOpenPort &
  EditorDocumentInsertImagePort &
  EditorDocumentExportPort;

const controller: ImportEditorSessionController = {
  canvas: null,
  exportDocument: vi.fn(),
  insertImage: vi.fn(),
  loadDocument: vi.fn(),
  openImage: vi.fn(),
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

function createSessionFile(payload: unknown): File {
  return new File([JSON.stringify(payload)], 'session.sniptale.json', {
    type: 'application/json',
  });
}

function createOversizedSessionFile(): File {
  const file = createSessionFile(createEditorDocument());
  Object.defineProperty(file, 'size', { value: 41 * 1024 * 1024 });
  return file;
}

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: vi.fn(),
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
  waitForEditorDocumentCanvasMock.mockResolvedValue(undefined);
});

it('ignores empty file selection when importing an editor session', async () => {
  const setImageData = vi.fn();

  await editorFileActions.importEditorSessionFromFile(controller, undefined, setImageData);

  expect(waitForEditorDocumentCanvasMock).not.toHaveBeenCalled();
  expect(controller.loadDocument).not.toHaveBeenCalled();
  expect(setImageData).not.toHaveBeenCalled();
});

it('loads a serialized editor document and updates source image data', async () => {
  const setImageData = vi.fn();
  const documentPayload = {
    ...createEditorDocument(),
    canvasHeight: 600,
    canvasWidth: 800,
    sourceImageData: 'data:image/png;base64,imported',
  };
  const file = createSessionFile(documentPayload);

  await editorFileActions.importEditorSessionFromFile(controller, file, setImageData);

  expect(waitForEditorDocumentCanvasMock).toHaveBeenCalledWith(controller);
  expect(controller.loadDocument).toHaveBeenCalledWith(
    expect.objectContaining({ sourceImageData: 'data:image/png;base64,imported' })
  );
  expect(setImageData).toHaveBeenCalledWith('data:image/png;base64,imported');
  expect(logEditorDocumentOpenTraceMock).toHaveBeenCalledWith(
    'session:loaded',
    expect.objectContaining({ canvasHeight: 600, canvasWidth: 800 })
  );
});

it('loads the default editor document shape and keeps imported source image data', async () => {
  const setImageData = vi.fn();
  const file = createSessionFile(createEditorDocument());

  await editorFileActions.importEditorSessionFromFile(controller, file, setImageData);

  expect(controller.loadDocument).toHaveBeenCalledWith(
    expect.objectContaining({
      canvasWidth: 320,
      sourceImageData: 'data:image/png;base64,doc',
    })
  );
  expect(setImageData).toHaveBeenCalledWith('data:image/png;base64,doc');
});

it('imports an exported editor document with default rich shape values', async () => {
  const setImageData = vi.fn();
  const defaultRichShape = createDefaultRichShapeObject({ id: 'rich-1' });
  const richShape = {
    ...defaultRichShape,
    style: {
      ...defaultRichShape.style,
      line: { ...defaultRichShape.style.line, width: 0 },
    },
  };
  const file = createSessionFile({ ...createEditorDocument(), richShapes: [richShape] });

  await editorFileActions.importEditorSessionFromFile(controller, file, setImageData);

  expect(controller.loadDocument).toHaveBeenCalledWith(
    expect.objectContaining({ richShapes: [richShape] })
  );
  expect(setImageData).toHaveBeenCalledWith('data:image/png;base64,doc');
});

it('rejects oversized editor sessions before reading file contents', async () => {
  const setImageData = vi.fn();
  const file = createOversizedSessionFile();

  await expect(
    editorFileActions.importEditorSessionFromFile(controller, file, setImageData)
  ).rejects.toThrow(translate('editor.runtime.sessionImportInvalid'));

  expect(waitForEditorDocumentCanvasMock).not.toHaveBeenCalled();
  expect(controller.loadDocument).not.toHaveBeenCalled();
  expect(setImageData).not.toHaveBeenCalled();
});
