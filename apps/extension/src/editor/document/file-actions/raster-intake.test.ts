// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertEditorRasterImageBlobCanBeRead,
  MAX_EDITOR_RASTER_IMAGE_FILE_BYTES,
  assertEditorRasterImageFileCanBeRead,
} from './raster-intake';
import type {
  EditorDocumentExportPort,
  EditorDocumentInsertImagePort,
  EditorDocumentOpenPort,
} from './ports';

type IntakeController = EditorDocumentOpenPort &
  EditorDocumentInsertImagePort &
  EditorDocumentExportPort;

const waitForEditorDocumentCanvasMock = vi.fn();
const readAsDataUrlMock = vi.fn();

vi.mock('./canvas-ready', () => ({
  waitForEditorDocumentCanvas: waitForEditorDocumentCanvasMock,
}));

vi.mock('./open-trace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./open-trace')>()),
  logEditorDocumentOpenTrace: vi.fn(),
}));

vi.mock('./file-reader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./file-reader')>()),
  readFileAsDataUrl: readAsDataUrlMock,
}));

let editorFileActions: typeof import('./');

beforeAll(async () => {
  editorFileActions = await import('./');
});

beforeEach(() => {
  vi.clearAllMocks();
  readAsDataUrlMock.mockResolvedValue('data:image/png;base64,valid');
  waitForEditorDocumentCanvasMock.mockResolvedValue(undefined);
});

function createController(): IntakeController {
  return {
    canvas: null,
    exportDocument: vi.fn(),
    insertImage: vi.fn(),
    loadDocument: vi.fn(),
    openImage: vi.fn(),
  };
}

function createSizedImageFile(size: number): File {
  const file = new File(['image'], 'capture.png', { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('assertEditorRasterImageFileCanBeRead', () => {
  it('accepts supported raster image files within the intake budget', () => {
    const file = createSizedImageFile(MAX_EDITOR_RASTER_IMAGE_FILE_BYTES);

    expect(() => assertEditorRasterImageFileCanBeRead(file)).not.toThrow();
  });

  it('rejects parameterized SVG MIME values before image read', () => {
    const blob = createSizedImageFile(128);

    expect(() => assertEditorRasterImageBlobCanBeRead(blob, 'image/svg+xml;charset=utf-8')).toThrow(
      'Invalid editor raster image file'
    );
  });
});

describe('editor raster image file intake', () => {
  it('rejects oversized open files before file read or controller mutation', async () => {
    const controller = createController();
    const setImageData = vi.fn();

    await expect(
      editorFileActions.openEditorImageFromFile(
        controller,
        createSizedImageFile(MAX_EDITOR_RASTER_IMAGE_FILE_BYTES + 1),
        setImageData
      )
    ).rejects.toThrow('Invalid editor raster image file');

    expect(readAsDataUrlMock).not.toHaveBeenCalled();
    expect(controller.openImage).not.toHaveBeenCalled();
    expect(setImageData).not.toHaveBeenCalled();
  });

  it('rejects invalid insert files before file read or controller mutation', async () => {
    const controller = createController();
    const file = new File(['<svg />'], 'vector.svg', { type: 'image/svg+xml' });

    await expect(editorFileActions.insertEditorImageFromFile(controller, file)).rejects.toThrow(
      'Invalid editor raster image file'
    );

    expect(readAsDataUrlMock).not.toHaveBeenCalled();
    expect(controller.insertImage).not.toHaveBeenCalled();
  });
});
