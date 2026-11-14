// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Group, type FabricObject } from 'fabric';
import { createEditorVectorInstance } from '../../../features/editor/document/vector-element';
import type { EditorVectorLibrarySnapshot } from '../../application/vector-elements/session';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import { EditorElementsPanel } from './index';
import { editorVectorErrorMessage } from './catalog';
import { EditorElementsManagement } from './management';
import { createEditorVectorRuntime } from '../../objects/vector-elements/runtime';

const mocks = vi.hoisted(() => ({
  snapshot: null as EditorVectorLibrarySnapshot | null,
  api: {
    refresh: vi.fn(async () => {}),
    refreshCacheUsage: vi.fn(async () => {}),
    getSnapshot: vi.fn(),
    loadCollections: vi.fn(async () => {}),
    select: vi.fn(),
    setQuery: vi.fn(),
    setFilter: vi.fn(),
    searchNow: vi.fn(async () => {}),
    setScroll: vi.fn(),
    setVisibleEntries: vi.fn(),
    favorite: vi.fn(async () => true),
    used: vi.fn(async () => {}),
    showMore: vi.fn(),
    removeItem: vi.fn(async () => true),
  },
  objects: [] as FabricObject[],
  editorState: { layers: [], history: { index: 0 } },
  controller: {
    canvas: { getObjects: () => mocks.objects },
    source: {},
    insertVectorElement: vi.fn(async () => true),
  },
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: (selector: (state: typeof mocks.editorState) => unknown) =>
    selector(mocks.editorState),
}));
vi.mock('../../application/controller-context', () => ({
  useEditorController: () => mocks.controller,
}));
vi.mock('../../application/vector-elements/context', () => ({
  useEditorVectorLibrarySession: () => mocks.api,
  useOptionalEditorVectorLibrarySession: () => mocks.api,
  useEditorVectorLibrarySnapshot: () => mocks.snapshot,
  EditorVectorLibraryProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) =>
    key === 'editor.elements.cacheUsage' ? 'Cache: {used} of {budget}' : key,
  useAppLocale: () => {},
  useAppLocaleMetadata: () => {},
  formatNumber: (value: number) => String(value),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.objects = [];
  mocks.editorState.history.index = 0;
  const definition = await prepareEditorVectorDefinition(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h10v10z"/></svg>',
    {
      sourceId: 'local',
      prefix: null,
      name: null,
      author: null,
      authorUrl: null,
      license: null,
      licenseUrl: null,
    }
  );
  mocks.snapshot = {
    query: '',
    tab: 'mine',
    collection: '',
    selectedKey: null,
    entries: [
      {
        key: definition.id,
        name: 'Imported element',
        prefix: null,
        definition,
        favorite: false,
        local: true,
        imported: true,
        issue: false,
      },
    ],
    settings: null,
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
  mocks.api.getSnapshot.mockImplementation(() => mocks.snapshot);
});
let host: HTMLDivElement, root: Root;
let placementContext: HTMLElement | null = null;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  placementContext?.remove();
  placementContext = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function button(name: string) {
  const value = Array.from(host.querySelectorAll('button')).find(
    (value) => value.getAttribute('aria-label') === name || value.textContent === name
  );
  if (!value) throw new Error(`Missing button ${name}`);
  return value;
}
async function renderPanel() {
  await act(async () => {
    root.render(<EditorElementsPanel />);
  });
}
describe('Elements placement portal recovery', () => {
  it.each([
    ['shadow', 'Escape'],
    ['shadow', 'blur'],
    ['dialog', 'Escape'],
    ['dialog', 'blur'],
  ])('keeps placement in its %s context and cancels on %s', async (context, cancellation) => {
    placementContext = document.createElement(context === 'dialog' ? 'dialog' : 'section');
    placementContext.setAttribute('data-theme', 'dark');
    if (context === 'dialog') placementContext.setAttribute('open', '');
    document.body.append(placementContext);
    const portal =
      context === 'shadow' ? placementContext.attachShadow({ mode: 'open' }) : placementContext;
    portal.append(host);
    const boundary = document.createElement('div');
    boundary.dataset['ui'] = 'editor.canvas.document-boundary';
    placementContext.append(boundary);
    await renderPanel();
    const card = host.querySelector<HTMLButtonElement>('[data-ui="editor.elements.card"]');
    if (!card) throw new Error('Missing card');
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, {
        button: 0,
        clientX: x,
        clientY: 20,
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      return event;
    };
    await act(async () => {
      card.dispatchEvent(pointer('pointerdown', 20));
      document.dispatchEvent(pointer('pointermove', 60));
    });
    const ghost = portal.querySelector('img.pointer-events-none');
    expect(ghost).not.toBeNull();
    expect(ghost?.getRootNode()).toBe(context === 'shadow' ? portal : document);
    expect(ghost?.parentNode).toBe(portal);
    expect(ghost?.getAttribute('data-theme')).toBe('dark');
    await act(async () => {
      if (cancellation === 'Escape')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(pointer('pointerup', 60));
    });
    expect(portal.querySelector('img.pointer-events-none')).toBeNull();
    expect(mocks.controller.insertVectorElement).not.toHaveBeenCalled();
  });
});

describe('Elements catalog visibility and source lifecycle', () => {
  it('loads a bounded preview fallback when intersection observation is unavailable', async () => {
    if (!mocks.snapshot) throw new Error('fixture');
    const entry = mocks.snapshot.entries[0]!;
    mocks.snapshot = {
      ...mocks.snapshot,
      entries: Array.from({ length: 64 }, (_, index) => ({ ...entry, key: `preview-${index}` })),
    };
    await renderPanel();
    expect(mocks.api.setVisibleEntries).toHaveBeenLastCalledWith(
      Array.from({ length: 8 }, (_, index) => `preview-${index}`)
    );
  });
  it('observes visible cards against the scroll owner and rejects stale observations', async () => {
    if (!mocks.snapshot) throw new Error('fixture');
    const entry = mocks.snapshot.entries[0]!;
    mocks.snapshot = {
      ...mocks.snapshot,
      entries: Array.from({ length: 64 }, (_, index) => ({ ...entry, key: `preview-${index}` })),
    };
    const observers: Observer[] = [];
    class Observer {
      readonly disconnect = vi.fn();
      readonly observe = vi.fn();
      constructor(
        readonly callback: IntersectionObserverCallback,
        readonly options: IntersectionObserverInit
      ) {
        observers.push(this);
      }
      emit(target: Element, isIntersecting: boolean) {
        this.callback(
          [
            {
              target,
              isIntersecting,
              boundingClientRect: new DOMRect(),
              intersectionRatio: isIntersecting ? 1 : 0,
              intersectionRect: new DOMRect(),
              rootBounds: null,
              time: 0,
            },
          ],
          {
            root: this.options.root ?? null,
            rootMargin: '72px 0px',
            scrollMargin: '0px',
            thresholds: [0],
            disconnect: this.disconnect,
            observe: this.observe,
            unobserve: vi.fn(),
            takeRecords: () => [],
          }
        );
      }
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    await renderPanel();
    const observer = observers[0]!;
    const cards = host.querySelectorAll('[data-ui="editor.elements.card"]');
    expect(observer.options).toEqual({
      root: host.querySelector('[data-ui="editor.elements.results"]'),
      rootMargin: '72px 0px',
      threshold: 0,
    });
    expect(observer.observe).toHaveBeenCalledTimes(64);
    expect(mocks.api.setVisibleEntries).not.toHaveBeenCalled();
    act(() => {
      observer.emit(cards[2]!, true);
      observer.emit(cards[0]!, true);
    });
    expect(mocks.api.setVisibleEntries).toHaveBeenLastCalledWith(['preview-0', 'preview-2']);
    act(() => observer.emit(cards[0]!, false));
    expect(mocks.api.setVisibleEntries).toHaveBeenLastCalledWith(['preview-2']);
    mocks.snapshot = {
      ...mocks.snapshot,
      entries: mocks.snapshot.entries.map((item) => ({ ...item })),
    };
    await renderPanel();
    expect(observers).toHaveLength(1);
    mocks.snapshot = { ...mocks.snapshot, query: 'replacement' };
    await renderPanel();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(observers).toHaveLength(2);
    mocks.api.setVisibleEntries.mockClear();
    act(() => observer.emit(cards[1]!, true));
    expect(mocks.api.setVisibleEntries).not.toHaveBeenCalled();
    act(() => root.render(null));
    expect(observers[1]!.disconnect).toHaveBeenCalledOnce();
    expect(mocks.api.setVisibleEntries).toHaveBeenLastCalledWith([]);
  });
  it('loads collections when a source is enabled once per source generation', async () => {
    await renderPanel();
    expect(mocks.api.loadCollections).not.toHaveBeenCalled();
    if (!mocks.snapshot) throw new Error('fixture');
    mocks.snapshot = {
      ...mocks.snapshot,
      settings: {
        key: 'settings',
        kind: 'settings',
        incarnation: 'source',
        revision: 1,
        baseUrl: 'https://icons.example/',
        networkEnabled: true,
        disclosureAccepted: true,
        sourceGeneration: 1,
      },
    };
    await renderPanel();
    await renderPanel();
    expect(mocks.api.loadCollections).toHaveBeenCalledOnce();
    mocks.snapshot = {
      ...mocks.snapshot,
      settings: { ...mocks.snapshot.settings!, sourceGeneration: 2 },
    };
    await renderPanel();
    expect(mocks.api.loadCollections).toHaveBeenCalledTimes(2);
    mocks.snapshot = {
      ...mocks.snapshot,
      settings: { ...mocks.snapshot.settings!, incarnation: 'replacement' },
    };
    await renderPanel();
    expect(mocks.api.loadCollections).toHaveBeenCalledTimes(3);
  });
});

describe('Elements inspector interaction', () => {
  it('selects on click without inserting and inserts exactly once on Enter', async () => {
    await renderPanel();
    const card = button('Imported element');
    act(() => card.click());
    expect(mocks.api.select).toHaveBeenCalledOnce();
    expect(mocks.controller.insertVectorElement).not.toHaveBeenCalled();
    await act(async () => {
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(mocks.controller.insertVectorElement).toHaveBeenCalledOnce();
  });
  it('keeps favorite activation separate from insertion', async () => {
    await renderPanel();
    act(() => button('editor.elements.favorite').click());
    expect(mocks.api.favorite).toHaveBeenCalledOnce();
    expect(mocks.controller.insertVectorElement).not.toHaveBeenCalled();
  });
  it('does not report an error response as an empty search and disables early rate-limit retries', async () => {
    if (!mocks.snapshot) throw new Error('fixture');
    mocks.snapshot = {
      ...mocks.snapshot,
      query: 'heart',
      entries: [],
      status: 'error',
      error: true,
      errorCode: 'rate-limited',
      retryAt: Date.now() + 60000,
    };
    await renderPanel();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'editor.elements.errorRateLimit'
    );
    expect(host.textContent).not.toContain('editor.elements.emptySearch');
    expect(button('editor.elements.retry').disabled).toBe(true);
  });
  it('uses one whole-panel scroll owner at short heights and restores list scrolling after expansion', async () => {
    let available = 197;
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const name = this.dataset['ui'];
      if (name === 'editor.elements.panel') return new DOMRect(0, 0, 350, available);
      if (name === 'editor.elements.header') return new DOMRect(0, 0, 350, 152);
      if (name === 'editor.elements.footer') return new DOMRect(0, 0, 350, 45);
      if (name === 'editor.elements.card') return new DOMRect(0, 0, 80, 64);
      return original.call(this);
    });
    const observers: ResizeObserver[] = [];
    const callbacks: (() => void)[] = [];
    class Observer implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        observers.push(this);
        callbacks.push(() => callback([], this));
      }
      observe(_target: Element) {}
      unobserve(_target: Element) {}
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', Observer);
    const intersectionRoots: (Element | Document | null | undefined)[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(_callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
          intersectionRoots.push(options.root);
        }
        observe(_target: Element) {}
        disconnect = disconnect;
      }
    );
    await renderPanel();
    const panel = host.querySelector('[data-ui="editor.elements.panel"]'),
      results = host.querySelector('[data-ui="editor.elements.results"]');
    expect(panel?.className).toContain('overflow-y-auto');
    expect(results?.className).toContain('overflow-visible');
    expect(results?.className).not.toContain('overflow-y-auto');
    expect(intersectionRoots.at(-1)).toBe(panel);
    available = 300;
    act(() => callbacks.forEach((callback) => callback()));
    expect(panel?.className).not.toContain('overflow-y-auto');
    expect(results?.className).toContain('overflow-y-auto');
    expect(intersectionRoots.at(-1)).toBe(results);
    expect(disconnect).toHaveBeenCalled();
    act(() => root.render(null));
    expect(
      observers.every((observer) => vi.mocked(observer.disconnect).mock.calls.length > 0)
    ).toBe(true);
  });
  it('distinguishes server refusal from a generic server failure', () => {
    expect(editorVectorErrorMessage('forbidden')).toBe('editor.elements.errorForbidden');
    expect(editorVectorErrorMessage('http-error')).toBe('editor.elements.errorNetwork');
  });
  it('keeps manual scroll and restores its position after management navigation', async () => {
    if (!mocks.snapshot) throw new Error('fixture');
    mocks.snapshot = { ...mocks.snapshot, scrollTop: 73 };
    await renderPanel();
    const results = host.querySelector<HTMLDivElement>('[data-ui="editor.elements.results"]');
    if (!results) throw new Error('Missing results');
    expect(results.scrollTop).toBe(73);
    results.scrollTop = 109;
    act(() => results.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(mocks.api.setScroll).toHaveBeenLastCalledWith(109);
    const writes = vi.spyOn(results, 'scrollTop', 'set');
    mocks.snapshot = { ...mocks.snapshot, scrollTop: 109 };
    await renderPanel();
    expect(results.scrollTop).toBe(109);
    expect(writes).not.toHaveBeenCalled();
    await act(async () => button('editor.elements.manage').click());
    await act(async () => button('editor.elements.back').click());
    const restored = host.querySelector<HTMLDivElement>('[data-ui="editor.elements.results"]');
    expect(restored).not.toBe(results);
    expect(restored?.scrollTop).toBe(109);
  });
  it('exposes an empty result only after a successful response', async () => {
    if (!mocks.snapshot) throw new Error('fixture');
    mocks.snapshot = {
      ...mocks.snapshot,
      query: 'heart',
      tab: 'catalog',
      entries: [],
      status: 'ready',
    };
    await renderPanel();
    expect(host.textContent).toContain('editor.elements.emptySearch');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  it('lists nested document sources without library membership and updates on removal and undo', async () => {
    const definition = await prepareEditorVectorDefinition(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h10v10z"/></svg>',
      {
        sourceId: 'https://icons.example/catalog/',
        prefix: 'sample',
        name: 'notice',
        author: 'Artist',
        authorUrl: 'https://artist.example/about?token=private',
        license: 'MIT',
        licenseUrl: 'https://license.example/mit#notice',
      }
    );
    const first = await createEditorVectorRuntime(
      definition,
      createEditorVectorInstance(definition.id)
    );
    const nested = new Group([
      await createEditorVectorRuntime(definition, createEditorVectorInstance(definition.id)),
    ]);
    mocks.objects = [first, nested];
    await act(async () => root.render(<EditorElementsManagement onBack={() => {}} />));
    const list = () => host.querySelector('[data-ui="editor.elements.used-sources"]');
    expect(list()).not.toBeNull();
    expect(list()?.querySelectorAll('[data-ui="editor.elements.source-notice"]')).toHaveLength(1);
    expect(list()?.textContent).toContain('https://icons.example/catalog/');
    expect(list()?.textContent).toContain('sample:notice');
    expect(list()?.querySelector('a[href="https://artist.example/about"]')).not.toBeNull();
    expect(list()?.querySelector('a[href="https://license.example/mit"]')).not.toBeNull();
    expect(list()?.querySelector('a')?.getAttribute('rel')).toContain('noreferrer');
    mocks.objects = [];
    mocks.editorState.history.index++;
    await act(async () => root.render(<EditorElementsManagement onBack={() => {}} />));
    expect(list()?.textContent).toContain('editor.elements.noUsedSources');
    mocks.objects = [nested];
    mocks.editorState.history.index--;
    await act(async () => root.render(<EditorElementsManagement onBack={() => {}} />));
    expect(list()?.textContent).toContain('sample:notice');
  });
  it('exposes source identity on card focus and displays cache usage or an explicit unknown state', async () => {
    await renderPanel();
    const card = host.querySelector<HTMLButtonElement>('[data-ui="editor.elements.card"]');
    const descriptionId = card?.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    act(() => card?.focus());
    expect(document.activeElement).toBe(card);
    expect(descriptionId && document.getElementById(descriptionId)?.textContent).toBe('local');
    expect(card?.getAttribute('aria-label')).toBe('Imported element');
    await renderPanel();
    expect(card?.getAttribute('aria-describedby')).toBe(descriptionId);
    expect(card?.title).toContain('local');
    await act(async () => root.render(<EditorElementsManagement onBack={() => {}} />));
    expect(host.querySelector('[data-ui="editor.elements.cache-usage"]')?.textContent).toContain(
      'editor.elements.cacheUsageUnknown'
    );
    if (!mocks.snapshot) throw new Error('fixture');
    mocks.snapshot = {
      ...mocks.snapshot,
      cacheUsage: { bytes: 1048576, entries: 3, budgetBytes: 20971520 },
    };
    await act(async () => root.render(<EditorElementsManagement onBack={() => {}} />));
    const usage = host.querySelector('[data-ui="editor.elements.cache-usage"]')?.textContent;
    expect(usage).toContain('1 shared.bytes.mb');
    expect(usage).toContain('20 shared.bytes.mb');
    expect(usage).not.toContain('editor.elements.cacheUsageUnknown');
    expect(mocks.api.refreshCacheUsage).toHaveBeenCalledOnce();
  });
  it('keeps unsafe author and license URLs inert in the offline document notices', async () => {
    const definition = await prepareEditorVectorDefinition(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h10v10z"/></svg>',
      {
        sourceId: 'offline-import',
        prefix: null,
        name: 'Unsafe links',
        author: 'Artist',
        authorUrl: 'javascript:alert(1)',
        license: 'Custom',
        licenseUrl: 'data:text/html,unsafe',
      }
    );
    mocks.objects = [
      await createEditorVectorRuntime(definition, createEditorVectorInstance(definition.id)),
    ];
    await act(async () => root.render(<EditorElementsManagement onBack={() => {}} />));
    const list = host.querySelector('[data-ui="editor.elements.used-sources"]');
    expect(list?.textContent).toContain('offline-import');
    expect(list?.textContent).toContain('Artist');
    expect(list?.textContent).toContain('Custom');
    expect(list?.querySelector('a')).toBeNull();
  });
});
