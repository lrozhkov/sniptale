import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';
import type { EditorVectorLibrarySnapshot } from '../../application/vector-elements/session';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';

const fixture = vi.hoisted(() => ({
  state: null as EditorVectorLibrarySnapshot | null,
  api: {
    setQuery: vi.fn(),
    setFilter: vi.fn(),
    searchNow: vi.fn(async () => {}),
    importFiles: vi.fn(async () => true),
    favorite: vi.fn(async () => true),
    removeItem: vi.fn(async () => true),
    createCollection: vi.fn(async () => true),
    renameCollection: vi.fn(async () => true),
    removeCollection: vi.fn(async () => true),
    downloadCollection: vi.fn(async () => {}),
    cancelDownload: vi.fn(async () => {}),
    enableSource: vi.fn(async () => true),
    saveSettings: vi.fn(async () => {}),
    checkConnection: vi.fn(async () => {}),
    refreshCacheUsage: vi.fn(async () => {}),
    clearCache: vi.fn(async () => {}),
    removePreset: vi.fn(async () => {}),
    select: vi.fn(),
    used: vi.fn(async () => {}),
  },
  controller: {
    canvas: { getObjects: () => [] },
    source: {},
    insertVectorElement: vi.fn(async () => true),
  },
}));
vi.mock('../../application/vector-elements/context', () => ({
  useEditorVectorLibrarySession: () => fixture.api,
  useEditorVectorLibrarySnapshot: () => fixture.state,
}));
vi.mock('../../application/controller-context', () => ({
  useEditorController: () => fixture.controller,
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: (selector: (state: { layers: never[]; history: { index: number } }) => unknown) =>
    selector({ layers: [], history: { index: 0 } }),
}));
vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => {},
  useAppLocaleMetadata: () => {},
  formatNumber: (value: number) => String(value),
}));
export function state() {
  if (!fixture.state) throw new Error('Missing fixture');
  return fixture.state;
}
export function setupElements() {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(async () => {
    vi.resetAllMocks();
    fixture.api.createCollection.mockResolvedValue(true);
    fixture.controller.insertVectorElement.mockResolvedValue(true);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value() {},
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value() {},
    });
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
      this: HTMLDialogElement
    ) {
      this.open = true;
    });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
      this: HTMLDialogElement
    ) {
      this.open = false;
    });
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
    fixture.state = {
      query: '',
      tab: 'catalog',
      collection: '',
      selectedKey: null,
      entries: [
        {
          key: definition.id,
          name: 'Arrow',
          prefix: null,
          definition,
          favorite: false,
          local: true,
          imported: true,
          issue: false,
        },
      ],
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
      remoteCollections: [{ prefix: 'sample', name: 'Sample icons' }],
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  return {
    host: () => host,
    render: async (node: ReactNode) => {
      await act(async () => root.render(node));
    },
    button: (name: string) => {
      const button = Array.from(host.querySelectorAll('button')).find(
        (item) => item.getAttribute('aria-label') === name || item.textContent === name
      );
      if (!button)
        throw new Error(
          `Missing button ${name}: ${Array.from(host.querySelectorAll('button'))
            .map((node) => node.getAttribute('aria-label'))
            .join(',')}`
        );
      return button;
    },
    input: (name: string) => {
      const input = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
      if (!input) throw new Error(`Missing input ${name}`);
      return input;
    },
  };
}
export function change(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
export async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
}
export async function choose(button: HTMLButtonElement, label: string) {
  await click(button);
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (node) => node.textContent === label
  );
  if (!option) throw new Error(`Missing option ${label}`);
  await click(option);
}
export function collection() {
  return {
    key: 'collection:local',
    kind: 'collection' as const,
    id: 'local',
    incarnation: 'first',
    revision: 1,
    name: 'My collection',
    deleted: false,
  };
}

export { fixture };
