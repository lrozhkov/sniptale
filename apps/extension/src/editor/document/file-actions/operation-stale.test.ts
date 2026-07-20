// @vitest-environment jsdom

import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';

const fileReaderMocks = vi.hoisted(() => ({
  readFileAsDataUrl: vi.fn(),
  readFileAsText: vi.fn(),
}));

const waitForEditorDocumentCanvasMock = vi.fn();

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../persistence/export-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/export-settings')>()),

  loadEditorExportSettings: vi.fn(),
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
  logEditorDocumentOpenTrace: vi.fn(),
}));

vi.mock('./file-reader', () => fileReaderMocks);

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function createEditorDocument(sourceImageData: string) {
  return {
    version: 1 as const,
    sourceImageData,
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

let editorFileActions: typeof import('./');

beforeAll(async () => {
  editorFileActions = await import('./');
});

beforeEach(() => {
  vi.clearAllMocks();
  waitForEditorDocumentCanvasMock.mockResolvedValue(undefined);
});

it('ignores older image-open file reads after a newer image selection starts', async () => {
  const firstRead = createDeferred<string>();
  const secondRead = createDeferred<string>();
  const controller = {
    canvas: {} as HTMLCanvasElement,
    exportDocument: vi.fn(),
    insertImage: vi.fn(),
    loadDocument: vi.fn(),
    openImage: vi.fn().mockResolvedValue(undefined),
  };
  const setImageData = vi.fn();
  fileReaderMocks.readFileAsDataUrl
    .mockReturnValueOnce(firstRead.promise)
    .mockReturnValueOnce(secondRead.promise);

  const firstOpen = editorFileActions.openEditorImageFromFile(
    controller as never,
    new File(['first'], 'first.png', { type: 'image/png' }),
    setImageData
  );
  const secondOpen = editorFileActions.openEditorImageFromFile(
    controller as never,
    new File(['second'], 'second.png', { type: 'image/png' }),
    setImageData
  );

  secondRead.resolve('data:image/png;base64,second');
  await secondOpen;
  firstRead.resolve('data:image/png;base64,first');
  await firstOpen;

  expect(controller.openImage).toHaveBeenCalledTimes(1);
  expect(controller.openImage).toHaveBeenCalledWith('data:image/png;base64,second', 'second.png');
  expect(setImageData).toHaveBeenCalledTimes(1);
  expect(setImageData).toHaveBeenCalledWith('data:image/png;base64,second');
});

it('ignores older session-import file reads after a newer import starts', async () => {
  const firstRead = createDeferred<string>();
  const secondRead = createDeferred<string>();
  const controller = {
    canvas: {} as HTMLCanvasElement,
    exportDocument: vi.fn(),
    insertImage: vi.fn(),
    loadDocument: vi.fn().mockResolvedValue(undefined),
    openImage: vi.fn(),
  };
  const setImageData = vi.fn();
  fileReaderMocks.readFileAsText
    .mockReturnValueOnce(firstRead.promise)
    .mockReturnValueOnce(secondRead.promise);

  const firstImport = editorFileActions.importEditorSessionFromFile(
    controller as never,
    new File(['first'], 'first.sniptale.json', { type: 'application/json' }),
    setImageData
  );
  const secondImport = editorFileActions.importEditorSessionFromFile(
    controller as never,
    new File(['second'], 'second.sniptale.json', { type: 'application/json' }),
    setImageData
  );

  secondRead.resolve(JSON.stringify(createEditorDocument('data:image/png;base64,second')));
  await secondImport;
  firstRead.resolve(JSON.stringify(createEditorDocument('data:image/png;base64,first')));
  await firstImport;

  expect(controller.loadDocument).toHaveBeenCalledTimes(1);
  expect(controller.loadDocument).toHaveBeenCalledWith(
    expect.objectContaining({ sourceImageData: 'data:image/png;base64,second' })
  );
  expect(setImageData).toHaveBeenCalledTimes(1);
  expect(setImageData).toHaveBeenCalledWith('data:image/png;base64,second');
});
