// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';

const mocks = vi.hoisted(() => ({ clearSession: vi.fn(), requestExit: vi.fn() }));

vi.mock('../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({ requestCheckpointExit: mocks.requestExit }),
}));

vi.mock('../document/page-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/page-session')>()),
  clearEditorPageSession: mocks.clearSession,
}));

import { closeEditorPageDocument } from './close-page-document';

beforeEach(() => vi.clearAllMocks());

it('closes the picker, detaches autosave, clears the URL session, and closes the document', async () => {
  const closeSavePicker = vi.fn();
  const discardDraft = vi.fn(async () => undefined);
  const flushAutosave = vi.fn(async (serialize: () => unknown) => void serialize());
  const closeDocument = vi.fn();

  await closeEditorPageDocument({
    closeSavePicker,
    controller: {
      autosaveService: { discardDraft, flushAutosave },
      closeDocument,
      exportDocument: () => createEditorDocumentFixture(),
    },
  });

  expect(closeSavePicker).toHaveBeenCalledOnce();
  expect(flushAutosave).toHaveBeenCalledOnce();
  expect(discardDraft).toHaveBeenCalledOnce();
  expect(flushAutosave.mock.invocationCallOrder[0]).toBeLessThan(
    discardDraft.mock.invocationCallOrder[0]!
  );
  expect(mocks.clearSession).toHaveBeenCalledOnce();
  expect(closeDocument).toHaveBeenCalledOnce();
});

it('still clears the page identity and document when detach cleanup fails after a flush', async () => {
  const error = new Error('cleanup failed');
  const closeDocument = vi.fn();

  await expect(
    closeEditorPageDocument({
      closeSavePicker: vi.fn(),
      controller: {
        autosaveService: {
          discardDraft: vi.fn(async () => Promise.reject(error)),
          flushAutosave: vi.fn(async () => undefined),
        },
        closeDocument,
        exportDocument: () => createEditorDocumentFixture(),
      },
    })
  ).rejects.toBe(error);

  expect(mocks.clearSession).toHaveBeenCalledOnce();
  expect(closeDocument).toHaveBeenCalledOnce();
});

it('keeps the document and session attached when the pending autosave cannot flush', async () => {
  const error = new Error('flush failed');
  const discardDraft = vi.fn(async () => undefined);
  const closeDocument = vi.fn();

  await expect(
    closeEditorPageDocument({
      closeSavePicker: vi.fn(),
      controller: {
        autosaveService: { discardDraft, flushAutosave: vi.fn(async () => Promise.reject(error)) },
        closeDocument,
        exportDocument: () => createEditorDocumentFixture(),
      },
    })
  ).rejects.toBe(error);

  expect(discardDraft).not.toHaveBeenCalled();
  expect(mocks.clearSession).not.toHaveBeenCalled();
  expect(closeDocument).not.toHaveBeenCalled();
});

it.each(['accepted', 'rejected', 'changed', 'changed-rejected', 'replaced'] as const)(
  'requests the exact saved checkpoint before close and guards the asynchronous gap: %s',
  async (outcome) => {
    const receipt = {
      rootKind: 'media' as const,
      rootId: 'image',
      revision: 'da6bbbd2-0e02-4462-8514-afcfdb746110',
    };
    let current = true;
    const request = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    mocks.requestExit.mockImplementation(() => {
      entered.resolve();
      return request.promise;
    });
    const service = {
      flushAutosave: vi.fn(async () => undefined),
      prepareCheckpointExit: vi.fn(async () => ({ receipt, isCurrent: () => current })),
      discardDraft: vi.fn(async () => undefined),
    };
    const controller = {
      autosaveService: service,
      closeDocument: vi.fn(),
      exportDocument: () => createEditorDocumentFixture(),
    };
    const closing = closeEditorPageDocument({ controller, closeSavePicker: vi.fn() });
    await Promise.race([
      entered.promise,
      closing.then(() => {
        throw new Error('Close completed before the checkpoint intent.');
      }),
    ]);
    expect(service.flushAutosave).not.toHaveBeenCalled();
    expect(service.discardDraft).not.toHaveBeenCalled();
    expect(mocks.requestExit).toHaveBeenCalledWith(receipt);
    if (outcome.startsWith('changed')) current = false;
    if (outcome === 'replaced') controller.autosaveService = { ...service };
    if (outcome.includes('rejected')) request.reject(new Error('runtime unavailable'));
    else request.resolve();
    if (outcome.startsWith('changed') || outcome === 'replaced') {
      await expect(closing).rejects.toThrow('changed');
      expect(service.discardDraft).not.toHaveBeenCalled();
      expect(mocks.clearSession).not.toHaveBeenCalled();
      expect(controller.closeDocument).not.toHaveBeenCalled();
    } else {
      await closing;
      expect(service.discardDraft).toHaveBeenCalledOnce();
      expect(controller.closeDocument).toHaveBeenCalledOnce();
    }
  }
);

it('keeps explicit disabled-autosave discard when the barrier has no pending receipt', async () => {
  const discardDraft = vi.fn(async () => undefined);
  await closeEditorPageDocument({
    closeSavePicker: vi.fn(),
    controller: {
      autosaveService: {
        flushAutosave: vi.fn(async () => undefined),
        discardDraft,
        prepareCheckpointExit: vi.fn(async () => ({ receipt: null, isCurrent: () => false })),
      },
      closeDocument: vi.fn(),
      exportDocument: () => createEditorDocumentFixture(),
    },
  });
  expect(mocks.requestExit).not.toHaveBeenCalled();
  expect(discardDraft).toHaveBeenCalledOnce();
});
