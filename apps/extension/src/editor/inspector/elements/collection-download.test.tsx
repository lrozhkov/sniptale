// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorVectorLibrarySnapshot } from '../../application/vector-elements/session';
import type { EditorVectorDownload } from '../../../composition/persistence/vector-elements/contracts';
import { EditorVectorCatalogError } from '../../../features/editor/vector-catalog';
import { EditorElementsCollectionDownload } from './collection-download';

const mocks = vi.hoisted(() => ({
  state: null as EditorVectorLibrarySnapshot | null,
  session: {
    checkCollectionUpdates: vi.fn(async (_prefix: string) => ({ added: 0, removed: 0 })),
    downloadCollection: vi.fn(async (_prefix: string) => {}),
    cancelDownload: vi.fn(async () => {}),
  },
}));
vi.mock('../../application/vector-elements/context', () => ({
  useEditorVectorLibrarySession: () => mocks.session,
  useEditorVectorLibrarySnapshot: () => mocks.state,
}));
vi.mock('../../../platform/i18n', () => ({ translate: (key: string) => key }));
let host: HTMLDivElement, root: Root;
function state() {
  if (!mocks.state) throw new Error('Missing state');
  return mocks.state;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.checkCollectionUpdates.mockResolvedValue({ added: 0, removed: 0 });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.state = {
    query: '',
    tab: 'catalog',
    collection: 'remote:sample',
    selectedKey: null,
    entries: [],
    settings: {
      key: 'settings',
      kind: 'settings',
      incarnation: 'source',
      revision: 1,
      baseUrl: 'https://api.iconify.design/',
      networkEnabled: true,
      disclosureAccepted: true,
      sourceGeneration: 1,
    },
    local: { items: [], collections: [], members: [], presets: [] },
    remoteCollections: [],
    status: 'ready',
    error: false,
    errorCode: null,
    retryAt: null,
    busy: false,
    scrollTop: 0,
    visibleCount: 128,
    imports: [],
    download: null,
    downloads: [],
    connected: false,
    cacheUsage: null,
    hasMore: false,
    remoteStart: 0,
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function retained(overrides: Partial<EditorVectorDownload> = {}): EditorVectorDownload {
  return {
    key: 'download',
    kind: 'download',
    collectionId: 'local',
    collectionIncarnation: 'first',
    incarnation: 'job',
    generation: 1,
    prefix: 'sample',
    source: { sourceId: state().settings!.baseUrl, incarnation: 'source', generation: 1 },
    manifest: ['arrow', 'heart'],
    accepted: { arrow: 'id' },
    status: 'ready',
    error: null,
    ...overrides,
  };
}
async function render() {
  mocks.state = { ...state() };
  await act(async () => root.render(<EditorElementsCollectionDownload />));
}
function button(name: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
async function click(name: string) {
  await act(async () => button(name).click());
}
it('downloads only on explicit action and exposes cancellation while running even in favorites', async () => {
  await render();
  expect(mocks.session.downloadCollection).not.toHaveBeenCalled();
  expect(mocks.session.checkCollectionUpdates).not.toHaveBeenCalled();
  await click('editor.elements.download');
  expect(mocks.session.downloadCollection).toHaveBeenCalledExactlyOnceWith('sample');
  state().tab = 'favorites';
  state().download = { prefix: 'sample', accepted: 1, total: 2, status: 'downloading' };
  await render();
  expect(button('sample: 1/2 · editor.elements.cancelDownload').title).toBe(
    'sample: 1/2 · editor.elements.cancelDownload'
  );
  await click('sample: 1/2 · editor.elements.cancelDownload');
  expect(mocks.session.cancelDownload).toHaveBeenCalledOnce();
  state().download = null;
  await render();
  expect(host.textContent).toBe('');
  expect(host.querySelector('button')).toBeNull();
});
it.each(['network', 'busy', 'different-source'] as const)(
  'keeps download disabled for %s admission refusal',
  async (reason) => {
    state().collection = 'local:local';
    state().downloads = [retained({ status: 'partial' })];
    if (reason === 'network') state().settings!.networkEnabled = false;
    if (reason === 'busy') state().busy = true;
    if (reason === 'different-source') state().settings!.baseUrl = 'https://replacement.example/';
    await render();
    expect(button('editor.elements.resume').disabled).toBe(true);
    await click('editor.elements.resume');
    expect(mocks.session.downloadCollection).not.toHaveBeenCalled();
  }
);
it('resumes a retained partial local collection and a current partial remote download', async () => {
  state().collection = 'local:local';
  state().downloads = [retained({ status: 'partial', source: null })];
  await render();
  await click('editor.elements.resume');
  expect(mocks.session.downloadCollection).toHaveBeenLastCalledWith('sample');
  state().collection = 'remote:other';
  state().download = { prefix: 'other', accepted: 1, total: 3, status: 'partial' };
  await render();
  await click('editor.elements.resume');
  expect(mocks.session.downloadCollection).toHaveBeenLastCalledWith('other');
  expect(mocks.session.checkCollectionUpdates).not.toHaveBeenCalled();
});
it('checks explicitly, prevents duplicate checks while pending and offers added names for download', async () => {
  state().downloads = [retained()];
  let finish: (value: { added: number; removed: number }) => void = () => {
    throw new Error('Missing check');
  };
  mocks.session.checkCollectionUpdates.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  expect(host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
    'editor.elements.collectionDownloaded'
  );
  expect(mocks.session.checkCollectionUpdates).not.toHaveBeenCalled();
  await click('editor.elements.checkCollectionUpdates');
  expect(button('editor.elements.checkCollectionUpdates').disabled).toBe(true);
  await click('editor.elements.checkCollectionUpdates');
  expect(mocks.session.checkCollectionUpdates).toHaveBeenCalledExactlyOnceWith('sample');
  await act(async () => finish({ added: 2, removed: 1 }));
  const label = 'editor.elements.collectionAdditions · editor.elements.collectionRemovedNames';
  expect(host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(label);
  await click(label);
  expect(mocks.session.downloadCollection).toHaveBeenCalledExactlyOnceWith('sample');
  expect(button('editor.elements.checkCollectionUpdates').disabled).toBe(false);
});
it('shows current names after a successful check without offering a duplicate download', async () => {
  state().downloads = [retained()];
  await render();
  await click('editor.elements.checkCollectionUpdates');
  expect(host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
    'editor.elements.collectionNamesCurrent'
  );
  expect(host.querySelectorAll('button')).toHaveLength(1);
  expect(mocks.session.downloadCollection).not.toHaveBeenCalled();
});
it.each([new EditorVectorCatalogError('network-failed'), new Error('unavailable')])(
  'keeps downloaded artwork usable and exposes retry after check failure %s',
  async (error) => {
    state().downloads = [retained()];
    mocks.session.checkCollectionUpdates.mockRejectedValueOnce(error);
    await render();
    await click('editor.elements.checkCollectionUpdates');
    expect(host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
      error instanceof EditorVectorCatalogError
        ? 'editor.elements.errorNetwork'
        : 'editor.elements.operationFailed'
    );
    expect(state().downloads[0]!.accepted).toEqual({ arrow: 'id' });
    await click('editor.elements.checkCollectionUpdates');
    expect(host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
      'editor.elements.collectionNamesCurrent'
    );
  }
);
it.each(['selection', 'source', 'generation', 'unmount'] as const)(
  'ignores a delayed check result after %s changes',
  async (change) => {
    state().downloads = [retained()];
    let finish: (value: { added: number; removed: number }) => void = () => {
      throw new Error('Missing check');
    };
    mocks.session.checkCollectionUpdates.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await render();
    await click('editor.elements.checkCollectionUpdates');
    if (change === 'selection') state().collection = 'remote:other';
    if (change === 'source') state().settings!.incarnation = 'new-source';
    if (change === 'generation') state().downloads[0]!.generation += 1;
    if (change === 'unmount') await act(async () => root.render(null));
    else await render();
    await act(async () => finish({ added: 2, removed: 1 }));
    expect(host.textContent).not.toContain('editor.elements.collectionAdditions');
    expect(
      host.querySelector(
        '[aria-label="editor.elements.collectionAdditions · editor.elements.collectionRemovedNames"]'
      )
    ).toBeNull();
  }
);
it('hides actions without a selected collection or when a saved remote source differs', async () => {
  state().collection = '';
  await render();
  expect(host.querySelector('button')).toBeNull();
  state().collection = 'remote:sample';
  state().downloads = [
    retained({
      source: { sourceId: 'https://different.example/', incarnation: 'old', generation: 1 },
    }),
  ];
  await render();
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(button('editor.elements.download')).toBeTruthy();
});
