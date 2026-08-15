// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { EditorSessionAutosaveService } from '../document/session-autosave';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';

const mocks = vi.hoisted(() => ({
  beginDraft: vi.fn(),
  openFile: vi.fn(),
}));

vi.mock('../document/file-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/file-actions')>()),
  openEditorImageFromFile: mocks.openFile,
}));
vi.mock('../document/page-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/page-session')>()),
  beginEditorPageLocalDraft: mocks.beginDraft,
}));

import { openLocalImageAsEditorDraft } from './open-local-image-draft';

beforeEach(() => vi.clearAllMocks());

function createController(
  autosaveService: Pick<EditorSessionAutosaveService, 'activate' | 'flushAutosave'> | null
) {
  return {
    autosaveService,
    canvas: null,
    loadDocument: vi.fn(async () => undefined),
    openImage: vi.fn(async () => undefined),
    exportDocument: vi.fn(() => createEditorDocumentFixture()),
    renderForExport: vi.fn(async () => 'data:image/png;base64,YQ=='),
  };
}

it('flushes the current draft and creates the new identity only after the image opens', async () => {
  const activate = vi.fn();
  const flushAutosave = vi.fn(async (serialize: () => unknown) => void serialize());
  const controller = createController({ activate, flushAutosave });
  const file = new File(['image'], 'local.png', { type: 'image/png' });
  mocks.openFile.mockImplementation(
    async (
      draftController: { openImage: (dataUrl: string, sourceName: string) => Promise<void> },
      selectedFile: File,
      _setImageData: unknown,
      lifecycle: { beforeOpen: () => Promise<void>; onOpened: () => void }
    ) => {
      await lifecycle.beforeOpen();
      await draftController.openImage('data:image/png;base64,YQ==', selectedFile.name);
      lifecycle.onOpened();
    }
  );

  await openLocalImageAsEditorDraft(controller, file, vi.fn());

  expect(flushAutosave).toHaveBeenCalledWith(expect.any(Function));
  expect(flushAutosave.mock.invocationCallOrder[0]).toBeLessThan(
    controller.openImage.mock.invocationCallOrder[0]!
  );
  expect(controller.openImage.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.beginDraft.mock.invocationCallOrder[0]!
  );
  expect(mocks.beginDraft).toHaveBeenCalledWith({
    autosaveService: controller.autosaveService,
    renderPresentation: expect.any(Function),
    sourceTitle: 'local.png',
  });
  const renderPresentation = mocks.beginDraft.mock.calls[0]?.[0].renderPresentation;
  await renderPresentation();
  expect(controller.renderForExport).toHaveBeenCalledWith({ format: 'png', quality: 1 });
});

it('fails instead of opening an unpersisted local document without autosave', async () => {
  const controller = createController(null);
  const file = new File(['image'], 'local.png', { type: 'image/png' });
  mocks.openFile.mockImplementation(
    async (
      draftController: { openImage: (dataUrl: string, sourceName: string) => Promise<void> },
      selectedFile: File,
      _setImageData: unknown,
      lifecycle: { beforeOpen: () => Promise<void>; onOpened: () => void }
    ) => {
      await lifecycle.beforeOpen();
      await draftController.openImage('data:image/png;base64,YQ==', selectedFile.name);
      lifecycle.onOpened();
    }
  );

  await expect(openLocalImageAsEditorDraft(controller, file, vi.fn())).rejects.toThrow(
    'Image autosave is unavailable.'
  );
  expect(mocks.beginDraft).not.toHaveBeenCalled();
});

it('keeps an empty file selection a no-op without creating a draft adapter', async () => {
  const controller = createController({ activate: vi.fn(), flushAutosave: vi.fn() });
  mocks.openFile.mockResolvedValue(undefined);

  await openLocalImageAsEditorDraft(controller, undefined, vi.fn());

  expect(mocks.openFile).toHaveBeenCalledWith(controller, undefined, expect.any(Function));
  expect(mocks.beginDraft).not.toHaveBeenCalled();
});

it('retains the current session identity when decoding the replacement fails', async () => {
  const flushAutosave = vi.fn(async () => undefined);
  const controller = createController({ activate: vi.fn(), flushAutosave });
  const error = new Error('decode failed');
  controller.openImage.mockRejectedValue(error);
  const file = new File(['image'], 'broken.png', { type: 'image/png' });
  mocks.openFile.mockImplementation(
    async (
      draftController: { openImage: (dataUrl: string, name: string) => Promise<void> },
      _file: File,
      _setImageData: unknown,
      lifecycle: { beforeOpen: () => Promise<void>; onOpened: () => void }
    ) => {
      await lifecycle.beforeOpen();
      await draftController.openImage('data:image/png;base64,YQ==', file.name);
      lifecycle.onOpened();
    }
  );

  await expect(openLocalImageAsEditorDraft(controller, file, vi.fn())).rejects.toBe(error);

  expect(flushAutosave).toHaveBeenCalledOnce();
  expect(mocks.beginDraft).not.toHaveBeenCalled();
});

it('uses the canonical controller as the file-open revision authority', async () => {
  const controller = createController({ activate: vi.fn(), flushAutosave: vi.fn() });
  const file = new File(['image'], 'local.png', { type: 'image/png' });
  mocks.openFile.mockResolvedValue(undefined);

  await openLocalImageAsEditorDraft(controller, file, vi.fn());

  expect(mocks.openFile).toHaveBeenCalledWith(
    controller,
    file,
    expect.any(Function),
    expect.objectContaining({ beforeOpen: expect.any(Function), onOpened: expect.any(Function) })
  );
});
