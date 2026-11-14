import { vi } from 'vitest';

export const expectedVectorLibraryCreation = ['editor_vector_library', { keyPath: 'key' }] as const;

export function createNativeUpgradeTransaction(put = vi.fn(), createIndex = vi.fn()) {
  return {
    abort: vi.fn(),
    objectStore: vi.fn((_name: string) => ({
      createIndex,
      openCursor: async () => null,
      index: () => ({ getAll: async () => [] }),
      put,
      clear: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    })),
  };
}

export function createNativeUpgradeFixture(stores: readonly string[]) {
  const names = new Set<string>(stores);
  const put = vi.fn();
  const createIndex = vi.fn();
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => {
      names.add(name);
      return { createIndex, put };
    }),
    deleteObjectStore: vi.fn(),
  };
  return {
    names,
    put,
    createIndex,
    db,
    transaction: createNativeUpgradeTransaction(put, createIndex),
  };
}
