// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
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
  setEffectBundleEnabled: toggle,
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
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
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
  ).toContain('1 из 2');
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
  return ['standalone', 'targetEffect', 'transition'].map((kind, index) => {
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
          kind: kind as 'standalone' | 'targetEffect' | 'transition',
          assets: [],
          schemaVersion: 'sniptale.effect.v1' as const,
          sha256: 'a'.repeat(64),
        },
      ],
    };
    return { ...entry, status: 'ready' as const, entry, documentKinds: [entry.documents[0]!.kind] };
  });
}
it('manages saved packs and confirms removal without per-pack export', async () => {
  list.mockResolvedValue(catalogRows());
  await act(async () => root.render(<VideoEffectsSection />));
  const row = container.querySelector('[data-settings-collection-item="pack-0"]')!;
  await act(async () => (row.querySelector('[role=switch]') as HTMLElement).click());
  expect(toggle).toHaveBeenCalledWith('pack-0', false);
  expect(row.querySelector('svg.lucide-download')).toBeNull();
  await act(async () =>
    (row.querySelector('[data-collection-inline-action="delete"]') as HTMLElement).click()
  );
  const dialog = document.querySelector('[role=alertdialog]')!;
  expect(dialog).not.toBeNull();
  const confirm = Array.from(dialog.querySelectorAll('button')).find(
    (b) => b.textContent === 'Удалить'
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
