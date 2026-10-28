// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadCompact: vi.fn(),
  loadCatalog: vi.fn(),
  saveCatalog: vi.fn(),
  subscribeCatalog: vi.fn(),
  saveCompact: vi.fn(),
  subscribeCompact: vi.fn(),
  loadRecent: vi.fn(),
  pushRecent: vi.fn(),
  subscribeRecent: vi.fn(),
}));
vi.mock('../persistence/picker-preferences', () => ({
  loadPickerCompact: mocks.loadCompact,
  loadPickerCatalog: mocks.loadCatalog,
  savePickerCatalog: mocks.saveCatalog,
  subscribePickerCatalog: mocks.subscribeCatalog,
  savePickerCompact: mocks.saveCompact,
  subscribePickerCompact: mocks.subscribeCompact,
}));
vi.mock('../persistence/recent-colors', () => ({
  loadRecentColors: mocks.loadRecent,
  pushRecentColor: mocks.pushRecent,
  subscribeRecentColors: mocks.subscribeRecent,
}));
import { usePickerPreferences } from './use-picker-preferences';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
let host: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof usePickerPreferences>;
function Probe({ density }: { density?: 'full' | 'compact' | undefined }) {
  current = usePickerPreferences(density);
  return <output data-compact={String(current.compact)}>{current.recentColors.join(',')}</output>;
}
async function render(density?: 'full' | 'compact') {
  await act(async () => root.render(<Probe density={density} />));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadCompact.mockResolvedValue(false);
  mocks.loadCatalog.mockResolvedValue(false);
  mocks.saveCatalog.mockResolvedValue(undefined);
  mocks.subscribeCatalog.mockReturnValue(vi.fn());
  mocks.saveCompact.mockResolvedValue(undefined);
  mocks.loadRecent.mockResolvedValue([]);
  mocks.pushRecent.mockResolvedValue([]);
  mocks.subscribeCompact.mockReturnValue(vi.fn());
  mocks.subscribeRecent.mockReturnValue(vi.fn());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('hydrates without writing and honors a controlled density without replacing preference', async () => {
  mocks.loadCompact.mockResolvedValue(true);
  await render('full');
  expect(current.compact).toBe(false);
  await render('compact');
  expect(current.compact).toBe(true);
  await render();
  expect(current.compact).toBe(true);
  expect(mocks.saveCompact).not.toHaveBeenCalled();
});

it('keeps usable defaults when preference and history hydration fail', async () => {
  mocks.loadCompact.mockRejectedValue(new Error('unavailable'));
  mocks.loadRecent.mockRejectedValue(new Error('unavailable'));
  await render();
  expect(current.compact).toBe(false);
  expect(current.recentColors).toEqual([]);
  expect(mocks.saveCompact).not.toHaveBeenCalled();
  expect(mocks.pushRecent).not.toHaveBeenCalled();
});

it('keeps an immediate user choice after a refused write and delayed initial read', async () => {
  const load = deferred<boolean>();
  mocks.loadCompact.mockReturnValue(load.promise);
  mocks.saveCompact.mockRejectedValue(new Error('refused'));
  await render();
  await act(async () => current.setCompact(true));
  expect(current.compact).toBe(true);
  await act(async () => load.resolve(false));
  expect(current.compact).toBe(true);
  expect(mocks.saveCompact).toHaveBeenCalledWith(true);
});

it('does not let initial density hydration replace a newer storage event', async () => {
  const load = deferred<boolean>();
  mocks.loadCompact.mockReturnValue(load.promise);
  await render();
  act(() => mocks.subscribeCompact.mock.calls[0]?.[0](true));
  await act(async () => load.resolve(false));
  expect(current.compact).toBe(true);
});

it('retains the newest history event when an initial history read finishes late', async () => {
  const load = deferred<string[]>();
  mocks.loadRecent.mockReturnValue(load.promise);
  await render();
  act(() => mocks.subscribeRecent.mock.calls[0]?.[0](['#aabbcc']));
  await act(async () => load.resolve(['#112233']));
  expect(current.recentColors).toEqual(['#aabbcc']);
});

it('does not let initial history hydration replace a newly accepted color', async () => {
  const load = deferred<string[]>();
  mocks.loadRecent.mockReturnValue(load.promise);
  mocks.pushRecent.mockResolvedValue(['#aabbcc']);
  await render();
  await act(async () => current.rememberColor('#aabbcc'));
  expect(current.recentColors).toEqual(['#aabbcc']);
  await act(async () => load.resolve(['#112233']));
  expect(current.recentColors).toEqual(['#aabbcc']);
});

it('does not replace a newer history storage event with a delayed writer result', async () => {
  const push = deferred<string[]>();
  mocks.pushRecent.mockReturnValue(push.promise);
  await render();
  act(() => current.rememberColor('#aabbcc'));
  act(() => mocks.subscribeRecent.mock.calls[0]?.[0](['#ddeeff', '#aabbcc']));
  await act(async () => push.resolve(['#aabbcc']));
  expect(current.recentColors).toEqual(['#ddeeff', '#aabbcc']);
});

it('retains valid history when accepting a color fails and unsubscribes on unmount', async () => {
  const stopCompact = vi.fn();
  const stopRecent = vi.fn();
  mocks.subscribeCompact.mockReturnValue(stopCompact);
  mocks.subscribeRecent.mockReturnValue(stopRecent);
  mocks.loadRecent.mockResolvedValue(['#112233']);
  mocks.pushRecent.mockRejectedValue(new Error('refused'));
  await render();
  await act(async () => current.rememberColor('#aabbcc'));
  expect(current.recentColors).toEqual(['#112233']);
  act(() => root.unmount());
  expect(stopCompact).toHaveBeenCalledOnce();
  expect(stopRecent).toHaveBeenCalledOnce();
  root = createRoot(host);
});

it('hydrates search mode without writes and retains a toggle after refused storage and delayed hydration', async () => {
  const load = deferred<boolean>();
  mocks.loadCatalog.mockReturnValue(load.promise);
  mocks.saveCatalog.mockRejectedValue(new Error('refused'));
  await render();
  expect(mocks.saveCatalog).not.toHaveBeenCalled();
  await act(async () => current.setCatalogMode(true));
  await act(async () => load.resolve(false));
  expect(current.catalogMode).toBe(true);
  expect(mocks.saveCatalog).toHaveBeenCalledWith(true);
});
it('lets newer search storage events win over hydration and observes reset and recreation', async () => {
  const load = deferred<boolean>();
  mocks.loadCatalog.mockReturnValue(load.promise);
  await render();
  act(() => mocks.subscribeCatalog.mock.calls[0]?.[0](true));
  await act(async () => load.resolve(false));
  expect(current.catalogMode).toBe(true);
  act(() => mocks.subscribeCatalog.mock.calls[0]?.[0](false));
  expect(current.catalogMode).toBe(false);
  await act(async () => current.setCatalogMode(true));
  expect(current.catalogMode).toBe(true);
});
it('restores search preference after remount and keeps storage refusal editable', async () => {
  mocks.loadCatalog.mockResolvedValue(true);
  await render();
  expect(current.catalogMode).toBe(true);
  const stop = mocks.subscribeCatalog.mock.results[0]?.value;
  act(() => root.unmount());
  expect(stop).toHaveBeenCalledOnce();
  root = createRoot(host);
  mocks.loadCatalog.mockRejectedValue(new Error('unavailable'));
  await render();
  expect(current.catalogMode).toBe(false);
  await act(async () => current.setCatalogMode(true));
  expect(current.catalogMode).toBe(true);
});
