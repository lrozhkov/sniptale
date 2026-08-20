import { expect, it, vi } from 'vitest';
import { applyEditorDocumentsV29Upgrade } from './core.editor-documents';

it('removes only legacy embedded editor document rows during the alpha cutover', async () => {
  const stores = new Map([
    ['image_workspaces', createStore()],
    ['scenario_step_editor_documents', createStore()],
  ]);
  const transaction = {
    abort: vi.fn(),
    objectStore: vi.fn((name: string) => stores.get(name)!),
  };

  await applyEditorDocumentsV29Upgrade(28, transaction);

  expect(stores.get('image_workspaces')?.clear).toHaveBeenCalledOnce();
  expect(stores.get('scenario_step_editor_documents')?.clear).toHaveBeenCalledOnce();
});

it('is non-destructive for fresh and already upgraded databases', async () => {
  const transaction = { abort: vi.fn(), objectStore: vi.fn() };
  await applyEditorDocumentsV29Upgrade(0, transaction);
  await applyEditorDocumentsV29Upgrade(29, transaction);
  expect(transaction.objectStore).not.toHaveBeenCalled();
});

it('surfaces clear failures to the versionchange transaction', async () => {
  const transaction = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({
      ...createStore(),
      clear: vi.fn(async () => Promise.reject(new Error('clear failed'))),
    })),
  };
  await expect(applyEditorDocumentsV29Upgrade(28, transaction)).rejects.toThrow('clear failed');
});

function createStore() {
  return {
    clear: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    getAll: vi.fn(async () => []),
    put: vi.fn(async () => undefined),
  };
}
