import { vi } from 'vitest';
import {
  isEditorVectorDefinition,
  type EditorVectorDefinition,
} from '../../../features/editor/document/vector-element';
import type {
  EditorVectorLibrary,
  EditorVectorItem,
  EditorVectorSettings,
} from '../../../composition/persistence/vector-elements';
import {
  createEditorVectorLibrarySession,
  type EditorVectorCatalogPort,
  type EditorVectorLibrarySession,
} from './session';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export function fixture() {
  let settings: EditorVectorSettings = {
    key: 'settings',
    kind: 'settings',
    baseUrl: 'https://api.iconify.design/',
    incarnation: 'source',
    revision: 0,
    sourceGeneration: 0,
    networkEnabled: false,
    disclosureAccepted: false,
  };
  const definitions = new Map<string, EditorVectorDefinition>();
  const items = new Map<string, EditorVectorItem>();
  const ref = {
    assetId: 'asset',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/asset' },
    mimeType: 'application/json',
    sha256: null,
    size: 100,
  };
  const library: EditorVectorLibrary = {
    readCatalog: vi.fn(async () => ({
      items: [...items.values()],
      collections: [],
      members: [],
      presets: [],
    })),
    readSettings: vi.fn(async () => settings),
    readDefinition: vi.fn(async (id: string) => {
      const value = definitions.get(id);
      if (!value) throw new Error('missing');
      return value;
    }),
    captureAdmission: vi.fn(async () => ({ expectedItem: null })),
    importDefinition: vi.fn(async (value, options = {}) => {
      if (!isEditorVectorDefinition(value)) throw new Error('invalid');
      definitions.set(value.id, value);
      items.set(value.id, {
        key: `item:${value.id}`,
        kind: 'item',
        definitionId: value.id,
        incarnation: 'item',
        revision: 0,
        name: options.name ?? value.provenance.name,
        prefix: value.provenance.prefix,
        receivedAt: 1,
        imported: true,
        favorite: false,
        usedAt: null,
        deleted: false,
      });
      return ref;
    }),
    updateSettings: vi.fn(async (patch, expected) => {
      if (settings.incarnation !== expected.incarnation || settings.revision !== expected.revision)
        throw new Error('stale');
      settings = {
        ...settings,
        ...patch,
        revision: settings.revision + 1,
        sourceGeneration: settings.sourceGeneration + 1,
      };
      return settings;
    }),
    setFavorite: vi.fn<EditorVectorLibrary['setFavorite']>(),
    markUsed: vi.fn<EditorVectorLibrary['markUsed']>(),
    removeItem: vi.fn<EditorVectorLibrary['removeItem']>(),
    createCollection: vi.fn<EditorVectorLibrary['createCollection']>(),
    renameCollection: vi.fn<EditorVectorLibrary['renameCollection']>(),
    removeCollection: vi.fn<EditorVectorLibrary['removeCollection']>(),
    savePreset: vi.fn<EditorVectorLibrary['savePreset']>(),
    removePreset: vi.fn<EditorVectorLibrary['removePreset']>(),
    publish: vi.fn<EditorVectorLibrary['publish']>(),
  };
  const source = {
    sourceId: settings.baseUrl,
    incarnation: settings.incarnation,
    generation: settings.sourceGeneration,
  };
  const catalog: EditorVectorCatalogPort = {
    collections: vi.fn(async () => ({ source, data: { test: { name: 'Test', total: 1 } } })),
    search: vi.fn(async () => ({ source, data: { icons: [], start: 0, limit: 64 } })),
    collection: vi.fn(async () => ({ source, data: { prefix: 'test', info: { name: 'Test' } } })),
    assets: vi.fn(async () => ({
      source,
      data: {
        prefix: 'test',
        icons: { new: { body: '<path d="M0 0h10v10z"/>' } },
        width: 24,
        height: 24,
      },
    })),
    check: vi.fn(async () => ({})),
  };
  const requestPermission = vi.fn(async () => true);
  const cache: Parameters<typeof createEditorVectorLibrarySession>[0]['cache'] = {
    read: vi.fn(async () => null),
    stats: vi.fn(async () => ({ bytes: 0, entries: 0, budgetBytes: 20 * 1024 * 1024 })),
    put: vi.fn(async () => true),
    touch: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  };
  const dependencies = {
    library,
    catalog,
    requestPermission,
    downloads: {
      begin: vi.fn(),
      inspect: vi.fn(),
      acceptBatch: vi.fn(),
      fail: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
    },
    cache,
  };
  const session = createEditorVectorLibrarySession(dependencies);
  return {
    session,
    library,
    catalog,
    requestPermission,
    definitions,
    items,
    source,
    cache,
    dependencies,
    setSettings: (next: Partial<EditorVectorSettings>) => {
      settings = { ...settings, ...next };
    },
  };
}
export function file(name: string, text: string) {
  const value = new File([text], name);
  Object.defineProperty(value, 'text', { value: async () => text });
  return value;
}
export const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h10v10z"/></svg>';

export async function reveal(session: EditorVectorLibrarySession) {
  session.setVisibleEntries(session.getSnapshot().entries.map((entry) => entry.key));
  await vi.waitFor(() => {
    expectPrepared(session);
  });
}
function expectPrepared(session: EditorVectorLibrarySession) {
  if (session.getSnapshot().entries.some((entry) => !entry.definition && !entry.issue))
    throw new Error('Artwork is still pending.');
}
