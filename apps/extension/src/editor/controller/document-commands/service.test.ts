import { beforeEach, expect, it, vi } from 'vitest';

import { createEditorDocumentCommandService } from './service';
import { createEditorDocumentFixture } from '../../document/page-session/document.test-support';

const operations = {
  closeDocument: vi.fn(),
  copyRenderedImage: vi.fn(async () => undefined),
  exportDocument: vi.fn(() => createEditorDocumentFixture()),
  loadDocument: vi.fn(async () => undefined),
  openImage: vi.fn(async () => undefined),
  renderToDataUrl: vi.fn(() => 'data:image/png;base64,rendered'),
};

function createController() {
  const adapter = { adapter: true };

  return {
    autosaveService: {
      discardDraft: vi.fn(async () => undefined),
      persistSnapshot: vi.fn(async (read) => {
        read();
      }),
    },
    exportDocument: vi.fn(() => createEditorDocumentFixture()),
    getPublicApiAdapter: vi.fn(() => adapter),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('runs open, load, close, export, render, and copy through injected operations', async () => {
  const service = createEditorDocumentCommandService({ operations });
  const controller = createController();

  await service.openImage(controller, 'data:image/png;base64,open', 'open.png');
  const document = createEditorDocumentFixture();
  await service.loadDocument(controller, document);
  service.closeDocument(controller);
  const exported = service.exportDocument(controller);
  const rendered = service.renderToDataUrl(controller, { format: 'png', quality: 0.9 });
  await service.copyRenderedImage(controller);

  expect(operations.openImage).toHaveBeenCalledWith(
    { adapter: true },
    'data:image/png;base64,open',
    'open.png',
    {}
  );
  expect(operations.loadDocument).toHaveBeenCalledWith({ adapter: true }, document);
  expect(operations.closeDocument).toHaveBeenCalledWith({ adapter: true });
  expect(operations.exportDocument).toHaveBeenCalledWith({ adapter: true });
  expect(operations.renderToDataUrl).toHaveBeenCalledWith(
    { adapter: true },
    { format: 'png', quality: 0.9 }
  );
  expect(operations.copyRenderedImage).toHaveBeenCalledWith({ adapter: true }, undefined);
  expect(controller.autosaveService.persistSnapshot).toHaveBeenCalledTimes(2);
  expect(controller.autosaveService.discardDraft).toHaveBeenCalledOnce();
  expect(exported).toEqual(createEditorDocumentFixture());
  expect(rendered).toBe('data:image/png;base64,rendered');
});

it('logs draft discard failures without blocking close', async () => {
  const error = new Error('delete failed');
  const logDiscardDraftError = vi.fn();
  const service = createEditorDocumentCommandService({ logDiscardDraftError, operations });
  const controller = createController();
  controller.autosaveService.discardDraft.mockRejectedValue(error);

  service.closeDocument(controller);
  await Promise.resolve();

  expect(operations.closeDocument).toHaveBeenCalledWith({ adapter: true });
  expect(logDiscardDraftError).toHaveBeenCalledWith(error);
});
