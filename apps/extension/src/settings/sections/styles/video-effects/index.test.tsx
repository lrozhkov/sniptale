// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import en from '../../../../platform/i18n/catalogs/en.json';
import ru from '../../../../platform/i18n/catalogs/ru.json';
import { prepareTranslations, type AppLocale } from '../../../../platform/i18n';
vi.mock('../../../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: vi.fn(async (locale: AppLocale) =>
    flatCatalogFixture(locale === 'ru' ? ru : en)
  ),
}));

beforeAll(async () => {
  await prepareTranslations('settings', 'en');
});
import type { EffectBundleCatalogListItem } from '../../../../features/video/project/effect-bundle/catalog';
const { list, toggle, remove, importFiles, get, exportCatalog } = vi.hoisted(() => ({
  get: vi.fn(),
  exportCatalog: vi.fn(),
  list: vi.fn(),
  toggle: vi.fn(),
  remove: vi.fn(),
  importFiles: vi.fn(),
}));
vi.mock('../../../../composition/persistence/effect-bundles', async (original) => ({
  ...(await original<typeof import('../../../../composition/persistence/effect-bundles')>()),
  getEffectBundle: get,
  listEffectBundles: list,
  setEffectDocumentEnabled: toggle,
  deleteEffectBundle: remove,
}));
vi.mock('../../../../composition/persistence/effect-bundles/import-files', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/effect-bundles/import-files')
  >()),
  importEffectFiles: importFiles,
}));
vi.mock('../../../../features/video/project/effect-bundle/catalog/export', async (original) => ({
  ...(await original<
    typeof import('../../../../features/video/project/effect-bundle/catalog/export')
  >()),
  exportEffectCatalog: exportCatalog,
}));
import { VideoEffectsSection } from './index';
import { translate } from '../../../../platform/i18n';
let root: Root;
let container: HTMLDivElement;
const entries: EffectBundleCatalogListItem[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  list.mockResolvedValue(entries);
  exportCatalog.mockResolvedValue({
    blob: new Blob(['pack']),
    filename: 'pack.sniptale-animations.zip',
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = vi.fn(() => 'blob:portable-pack');
      static override revokeObjectURL = vi.fn();
    }
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('keeps readonly filters enabled and mounted while an effect update is pending', async () => {
  list.mockResolvedValue(catalogRows());
  let release!: () => void;
  toggle.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  await act(async () => root.render(<VideoEffectsSection />));
  const filters = container.querySelector('[data-ui="effect-catalog.filters"]')!;
  const categories = [
    ...filters.querySelectorAll<HTMLButtonElement>('button.effect-catalog-category'),
  ];
  const row = container.querySelector('[data-settings-collection-item="pack-0/effect-0"]')!;
  await act(async () => row.querySelector<HTMLButtonElement>('[role=switch]')!.click());
  expect(container.querySelector('[data-ui="effect-catalog.filters"]')).toBe(filters);
  for (const button of categories) expect(button.disabled).toBe(false);
  await act(async () => release());
});
it('accepts multiple files and shows partial success without hiding the catalog', async () => {
  const files = [new File(['{}'], 'good.json'), new File(['!'], 'bad.json')];
  importFiles.mockResolvedValue([
    { filename: 'good.json', status: 'imported' },
    { filename: 'bad.json', status: 'failed' },
  ]);
  await act(async () => root.render(<VideoEffectsSection />));
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(input.multiple).toBe(true);
  Object.defineProperty(input, 'files', { value: files });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(importFiles).toHaveBeenCalledWith(files);
  expect(
    container.querySelector('[data-ui="effect-catalog.import-result"]')?.textContent
  ).toContain('1 of 2');
  expect(container.textContent).toContain('bad.json');
  expect(input.value).toBe('');
});
it('ignores a late load after leaving settings', async () => {
  let finish!: (value: EffectBundleCatalogListItem[]) => void;
  list.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  act(() => root.render(<VideoEffectsSection />));
  act(() => root.render(null));
  await act(async () => finish([]));
  expect(container.innerHTML).toBe('');
});

function catalogRows(): EffectBundleCatalogListItem[] {
  return [0, 1, 2].map((index) => {
    const entry = {
      packId: `pack-${index}`,
      label: { en: `Pack ${index}`, ru: `Пакет ${index}` },
      description: { en: '', ru: '' },
      enabled: true,
      source: 'raw-json' as const,
      sourceSha256: 'a'.repeat(64),
      version: '1.0.0',
      createdAt: 0,
      updatedAt: 0,
      retainedByteLength: 2,
      assets: [],
      documents: [
        {
          id: `effect-${index}`,
          source: '{}',
          kind: 'standalone' as const,
          assets: [],
          schemaVersion: 'sniptale.animation.v1' as const,
          sha256: 'a'.repeat(64),
        },
      ],
    };
    return { ...entry, status: 'ready' as const, entry, documentKinds: [entry.documents[0]!.kind] };
  });
}
it('manages saved packs with download and confirms removal', async () => {
  list.mockResolvedValue(catalogRows());
  await act(async () => root.render(<VideoEffectsSection />));
  const row = container.querySelector('[data-settings-collection-item="pack-0/effect-0"]')!;
  await act(async () => (row.querySelector('[role=switch]') as HTMLElement).click());
  expect(toggle).toHaveBeenCalledWith('pack-0', 'effect-0', false);
  expect(row.querySelector('svg.lucide-download')).not.toBeNull();
  await act(async () =>
    (row.querySelector('[data-collection-inline-action="delete"]') as HTMLElement).click()
  );
  const dialog = document.querySelector('[role=alertdialog]')!;
  expect(dialog).not.toBeNull();
  const confirm = Array.from(dialog.querySelectorAll('button')).find(
    (b) => b.textContent === 'Delete'
  )!;
  await act(async () => confirm.click());
  expect(remove).toHaveBeenCalledWith('pack-0');
});
it('shows load and operation failures and recovers on focus', async () => {
  list.mockRejectedValueOnce(new Error('load'));
  await act(async () => root.render(<VideoEffectsSection />));
  expect(container.querySelector('[role=alert]')).not.toBeNull();
  list.mockResolvedValue(catalogRows());
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(container.querySelector('[role=alert]')).toBeNull();
  toggle.mockRejectedValueOnce(new Error('save'));
  const button = container.querySelector('[role=switch]') as HTMLElement;
  await act(async () => button.click());
  expect(container.querySelector('[role=alert]')).not.toBeNull();
});

it('downloads the selected complete pack without reload or mutation and releases its URL', async () => {
  const rows = catalogRows();
  list.mockResolvedValue(rows);
  await act(async () => root.render(<VideoEffectsSection />));
  const loads = list.mock.calls.length;
  vi.useFakeTimers();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-collection-inline-action="download"]')!
      .click()
  );
  expect(exportCatalog).toHaveBeenCalledExactlyOnceWith(
    rows[0]!.status === 'ready' ? rows[0]!.entry : undefined
  );
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  expect(list).toHaveBeenCalledTimes(loads);
  expect(toggle).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(importFiles).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:portable-pack');
});
it('keeps a failed download retryable without changing the visible catalogue', async () => {
  list.mockResolvedValue(catalogRows());
  exportCatalog.mockRejectedValueOnce(new Error('PRIVATE_CONTENT'));
  await act(async () => root.render(<VideoEffectsSection />));
  const button = container.querySelector<HTMLButtonElement>(
    '[data-collection-inline-action="download"]'
  )!;
  await act(async () => button.click());
  expect(container.textContent).toContain(
    translate('videoEditor.effectsLibrary.downloadPackFailed')
  );
  expect(container.textContent).not.toContain('PRIVATE_CONTENT');
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
});
it('suppresses a late download after leaving Settings', async () => {
  list.mockResolvedValue(catalogRows());
  const deferred = Promise.withResolvers<{ blob: Blob; filename: string }>();
  exportCatalog.mockReturnValueOnce(deferred.promise);
  await act(async () => root.render(<VideoEffectsSection />));
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-collection-inline-action="download"]')!
      .click()
  );
  act(() => root.render(null));
  await act(async () => deferred.resolve({ blob: new Blob(['pack']), filename: 'pack.zip' }));
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('offers no package download for builtin or malformed rows', async () => {
  const rows = catalogRows();
  const first = rows[0];
  if (!first || first.status !== 'ready') throw new Error('Missing fixture');
  list.mockResolvedValue([
    { ...first, source: 'builtin', entry: { ...first.entry, source: 'builtin' } },
    { status: 'invalid', packId: 'broken' },
  ]);
  await act(async () => root.render(<VideoEffectsSection />));
  expect(container.querySelector('[data-collection-inline-action="download"]')).toBeNull();
});

it('serializes preparation and copy saves, preserves the source and retries the same copy identity', async () => {
  const { useVideoEffectsSettings } = await import('./controller');
  const { validateAnimationTemplate } =
    await import('@sniptale/runtime-contracts/animation-template');
  const source = validateAnimationTemplate({
    format: 'sniptale-animation',
    version: 1,
    id: 'mapping-source',
    label: { en: 'Source' },
    resources: [],
    controls: [],
    bindings: [],
    animation: {
      v: '5.12.2',
      fr: 30,
      w: 320,
      h: 180,
      ip: 0,
      op: 60,
      assets: [],
      layers: [],
      slots: { title: { p: { a: 0, k: [{ t: 0, s: { t: 'Keep' } }] } } },
    },
  });
  if (!source.ok) throw new Error('Invalid source');
  const raw = JSON.stringify(source.template);
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256').update(raw).digest('hex');
  const row = catalogRows()[0]!;
  if (row.status !== 'ready') throw new Error('Invalid fixture');
  const catalog = {
    ...row.entry,
    packId: 'animation.mapping-source',
    sourceSha256: digest,
    retainedByteLength: new TextEncoder().encode(raw).byteLength,
    documents: [{ ...row.entry.documents[0]!, id: 'mapping-source', source: raw, sha256: digest }],
  };
  const before = structuredClone(catalog);
  const pendingRead = Promise.withResolvers<typeof catalog>();
  get.mockReturnValueOnce(pendingRead.promise);
  let state!: ReturnType<typeof useVideoEffectsSettings>;
  function Probe() {
    state = useVideoEffectsSettings();
    return null;
  }
  await act(async () => root.render(<Probe />));
  let first!: Promise<boolean>;
  await act(async () => {
    first = state.configure(catalog.packId, 'mapping-source', null);
    expect(await state.configure(catalog.packId, 'mapping-source', null)).toBe(false);
  });
  await act(async () => {
    pendingRead.resolve(catalog);
    await first;
  });
  expect(get).toHaveBeenCalledOnce();
  expect(state.mapping).not.toBeNull();
  const { prepareSlotMappedAnimation, createSlotMappingDrafts } =
    await import('./slot-mapping-model');
  const copy = prepareSlotMappedAnimation({
    template: source.template,
    id: state.mapping!.copyId,
    label: 'Copy',
    drafts: createSlotMappingDrafts(source.template).map((draft) => ({ ...draft, enabled: true })),
  });
  expect(await state.saveMapping({ ...copy, id: 'wrong-identity' })).toBe(false);
  expect(importFiles).not.toHaveBeenCalled();
  importFiles.mockResolvedValueOnce([{ filename: 'copy.json', status: 'failed' }]);
  await act(async () => {
    expect(await state.saveMapping(copy)).toBe(false);
  });
  expect(state.mapping?.copyId).toBe(copy.id);
  const pendingSave = Promise.withResolvers<unknown[]>();
  importFiles.mockReturnValueOnce(pendingSave.promise);
  let save!: Promise<boolean>;
  await act(async () => {
    save = state.saveMapping(copy);
    expect(await state.saveMapping(copy)).toBe(false);
    state.closeMapping();
  });
  expect(state.mapping?.copyId).toBe(copy.id);
  await act(async () => {
    pendingSave.resolve([{ filename: 'copy.json', status: 'imported' }]);
    expect(await save).toBe(true);
  });
  expect(importFiles).toHaveBeenCalledTimes(2);
  expect(state.mapping).toBeNull();
  expect(catalog).toEqual(before);
  expect(toggle).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  get.mockResolvedValueOnce(catalog);
  await act(async () => {
    await state.configure(catalog.packId, 'mapping-source', null);
  });
  const abandonedCopy = { ...copy, id: state.mapping!.copyId };
  const abandonedSave = Promise.withResolvers<unknown[]>();
  importFiles.mockReturnValueOnce(abandonedSave.promise);
  let abandoned!: Promise<boolean>;
  await act(async () => {
    abandoned = state.saveMapping(abandonedCopy);
  });
  const signal = importFiles.mock.calls.at(-1)![1] as AbortSignal;
  expect(signal.aborted).toBe(false);
  act(() => root.render(null));
  expect(signal.aborted).toBe(true);
  await act(async () => {
    abandonedSave.resolve([{ filename: 'copy.json', status: 'failed' }]);
    await abandoned;
  });
  expect(container.innerHTML).toBe('');
  expect(catalog).toEqual(before);
});

function flatCatalogFixture(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid authored catalog fixture');
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(flatCatalogFixture(child, prefix ? `${prefix}.${key}` : key))
    )
  );
}
