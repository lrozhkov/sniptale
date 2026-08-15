// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';

const mocks = vi.hoisted(() => ({ clearSession: vi.fn() }));

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
