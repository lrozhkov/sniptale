// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectBundleCatalogListItem } from '../../features/video/project/effect-bundle/catalog';
import { EFFECT_CATALOG_CHANGED_EVENT } from '../../features/video/project/effect-bundle/catalog/presets';
import { useReviewAnnotationCatalog } from './use-annotation-effects-catalog';

let root: Root;
let current: ReturnType<typeof useReviewAnnotationCatalog>;
const read = vi.fn<() => Promise<EffectBundleCatalogListItem[]>>();
function Harness({ active = true }: { active?: boolean }) {
  current = useReviewAnnotationCatalog(active, read);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
  read.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('loads only for the active picker and refreshes from existing catalog and focus signals', async () => {
  read.mockResolvedValue([{ packId: 'one', status: 'invalid' }]);
  await act(async () => root.render(<Harness active={false} />));
  expect(read).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness />));
  expect(current.phase).toBe('ready');
  expect(current.items).toEqual([{ packId: 'one', status: 'invalid' }]);
  await act(async () => window.dispatchEvent(new Event(EFFECT_CATALOG_CHANGED_EVENT)));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(read).toHaveBeenCalledTimes(3);
  await act(async () => root.render(<Harness active={false} />));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(read).toHaveBeenCalledTimes(3);
  expect(current.items).toEqual([]);
});

it('ignores older requests after a newer catalog refresh without replacing lazy entry functions', async () => {
  let first!: (value: EffectBundleCatalogListItem[]) => void;
  let second!: (value: EffectBundleCatalogListItem[]) => void;
  read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          first = resolve;
        })
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          second = resolve;
        })
    );
  await act(async () => root.render(<Harness />));
  await act(async () => window.dispatchEvent(new Event(EFFECT_CATALOG_CHANGED_EVENT)));
  const materialize = vi.fn();
  const entry: EffectBundleCatalogListItem = {
    status: 'ready',
    packId: 'builtin',
    source: 'builtin',
    label: { en: 'Title', ru: 'Заголовок' },
    createdAt: 0,
    updatedAt: 0,
    retainedByteLength: 0,
    version: '1',
    enabled: true,
    documentKinds: ['standalone'],
    entry: {
      packId: 'builtin',
      source: 'builtin',
      label: { en: 'Title', ru: 'Заголовок' },
      description: { en: '', ru: '' },
      createdAt: 0,
      updatedAt: 0,
      version: '1',
      enabled: true,
      retainedByteLength: 0,
      sourceSha256: 'hash',
      assets: [],
      documents: [],
      materializeDocument: materialize,
    },
  };
  await act(async () => second([entry]));
  await act(async () => first([{ status: 'invalid', packId: 'stale' }]));
  expect(current.items[0]).toBe(entry);
  expect(materialize).not.toHaveBeenCalled();
  expect(current.phase).toBe('ready');
});

it('retains recoverable failure and reloads explicitly', async () => {
  read.mockRejectedValueOnce(new Error('private catalog details')).mockResolvedValueOnce([]);
  await act(async () => root.render(<Harness />));
  expect(current.phase).toBe('failed');
  expect(current.items).toEqual([]);
  await act(async () => current.reload());
  expect(current.phase).toBe('ready');
  expect(read).toHaveBeenCalledTimes(2);
});

it('suppresses a pending result after deactivation and detaches refresh listeners', async () => {
  let finish!: (value: EffectBundleCatalogListItem[]) => void;
  read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await act(async () => root.render(<Harness />));
  await act(async () => root.render(<Harness active={false} />));
  await act(async () => finish([{ status: 'invalid', packId: 'late' }]));
  expect(current.items).toEqual([]);
  await act(async () => window.dispatchEvent(new Event(EFFECT_CATALOG_CHANGED_EVENT)));
  expect(read).toHaveBeenCalledTimes(1);
});
