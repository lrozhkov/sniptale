import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  closeEditorDocumentViaController: vi.fn(),
  copyRenderedEditorImageViaController: vi.fn(async () => undefined),
  exportEditorDocumentViaController: vi.fn(() => ({ version: 1 })),
  loggerError: vi.fn(),
  loadEditorDocumentViaController: vi.fn(async () => undefined),
  openEditorImageViaController: vi.fn(async () => undefined),
  renderEditorControllerToDataUrl: vi.fn(() => 'data:image/png;base64,rendered'),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({
    child: vi.fn(),
    debug: vi.fn(),
    error: mocks.loggerError,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../../public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../public-api')>()),
  closeEditorDocumentViaController: mocks.closeEditorDocumentViaController,
  copyRenderedEditorImageViaController: mocks.copyRenderedEditorImageViaController,
  exportEditorDocumentViaController: mocks.exportEditorDocumentViaController,
  loadEditorDocumentViaController: mocks.loadEditorDocumentViaController,
  openEditorImageViaController: mocks.openEditorImageViaController,
  renderEditorControllerToDataUrl: mocks.renderEditorControllerToDataUrl,
}));

import {
  closeDocumentForController,
  copyRenderedImageForController,
  exportDocumentForController,
  loadDocumentForController,
  openImageForController,
  renderToDataUrlForController,
} from './document';
import { createImageEditorController } from '../../../core/controller';
import { createEditorDocumentFixture } from '../../../../document/page-session/document.test-support';
import type { EditorSessionAutosaveService } from '../../../../document/session-autosave';

function createAutosaveService(
  overrides: Partial<EditorSessionAutosaveService> = {}
): EditorSessionAutosaveService {
  return {
    activate: vi.fn(),
    discardDraft: vi.fn(async () => undefined),
    dispose: vi.fn(),
    flushAutosave: vi.fn(async () => undefined),
    persistSnapshot: vi.fn(async (read) => {
      read();
    }),
    restoreDraft: vi.fn(async () => undefined),
    scheduleAutosave: vi.fn(),
    updateContext: vi.fn(),
    ...overrides,
  };
}

it('delegates document operations through the public adapter and persists autosave snapshots', async () => {
  const controller = createImageEditorController();
  const autosaveService = createAutosaveService();
  controller.autosaveService = autosaveService;

  await openImageForController(controller, 'data:image/png;base64,open', 'open.png');
  const document = createEditorDocumentFixture();
  await loadDocumentForController(controller, document);
  closeDocumentForController(controller);
  const rendered = renderToDataUrlForController(controller, {
    format: 'png',
    quality: 0.9,
  });
  await copyRenderedImageForController(controller);

  expect(mocks.openEditorImageViaController).toHaveBeenCalledWith(
    expect.any(Object),
    'data:image/png;base64,open',
    'open.png',
    {}
  );
  expect(mocks.loadEditorDocumentViaController).toHaveBeenCalledOnce();
  expect(autosaveService.persistSnapshot).toHaveBeenCalledTimes(2);
  expect(autosaveService.discardDraft).toHaveBeenCalledOnce();
  expect(mocks.closeEditorDocumentViaController).toHaveBeenCalledWith(expect.any(Object));
  expect(exportDocumentForController(controller)).toEqual({ version: 1 });
  expect(mocks.renderEditorControllerToDataUrl).toHaveBeenCalledWith(expect.any(Object), {
    format: 'png',
    quality: 0.9,
  });
  expect(mocks.copyRenderedEditorImageViaController).toHaveBeenCalledWith(
    expect.any(Object),
    undefined
  );
  expect(rendered).toBe('data:image/png;base64,rendered');
});

it('handles draft discard failures explicitly when closing a document', async () => {
  const error = new Error('delete failed');
  const controller = createImageEditorController();
  const autosaveService = createAutosaveService({
    discardDraft: vi.fn(async () => {
      throw error;
    }),
  });
  controller.autosaveService = autosaveService;

  closeDocumentForController(controller);
  await Promise.resolve();

  expect(autosaveService.discardDraft).toHaveBeenCalledOnce();
  expect(mocks.closeEditorDocumentViaController).toHaveBeenCalledWith(expect.any(Object));
  expect(mocks.loggerError).toHaveBeenCalledWith('Failed to discard editor draft on close', error);
});
