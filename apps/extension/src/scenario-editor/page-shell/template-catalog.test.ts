// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useGuideTemplateCatalog } from './template-catalog';
const io = vi.hoisted(() => ({ list: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('../../composition/persistence/scenario/store/public', () => ({
  listScenarioStepTemplates: io.list,
}));
vi.mock('../../features/media-hub/events', () => ({ subscribeToMediaHubEvents: io.subscribe }));
let root: Root;
let host: HTMLDivElement;
let snapshot: ReturnType<typeof useGuideTemplateCatalog>;
let listener: (event: { type: string }) => void;
function Probe() {
  snapshot = useGuideTemplateCatalog();
  return null;
}
function entry(id: string) {
  return {
    id,
    name: id,
    purpose: 'step-template' as const,
    availability: 'available' as const,
    createdAt: 1,
    updatedAt: 1,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.list.mockResolvedValue([entry('saved')]);
  io.subscribe.mockImplementation((callback) => {
    listener = callback;
    return io.unsubscribe;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(createElement(Probe)));
}
it('exposes unavailable loading and supports a successful explicit retry', async () => {
  io.list.mockRejectedValueOnce(new Error('Unavailable'));
  await mount();
  expect(snapshot.status).toBe('failed');
  expect(snapshot.entries).toEqual([]);
  await act(async () => snapshot.reload());
  expect(snapshot.status).toBe('ready');
  expect(snapshot.entries.map((item) => item.id)).toEqual(['saved']);
});
it('refreshes on library changes and focus, and releases the subscription on unmount', async () => {
  await mount();
  await act(async () => listener({ type: 'storage-alert' }));
  expect(io.list).toHaveBeenCalledTimes(1);
  io.list.mockResolvedValue([entry('renamed')]);
  await act(async () => listener({ type: 'library-changed' }));
  expect(snapshot.entries.map((item) => item.id)).toEqual(['renamed']);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(io.list).toHaveBeenCalledTimes(3);
  act(() => root.unmount());
  expect(io.unsubscribe).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('focus'));
  expect(io.list).toHaveBeenCalledTimes(3);
});
it('keeps the newest catalog when an earlier request completes later', async () => {
  let resolveFirst!: (entries: ReturnType<typeof entry>[]) => void;
  io.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
  );
  await mount();
  expect(snapshot.status).toBe('loading');
  await act(async () => snapshot.reload());
  await act(async () => resolveFirst([entry('obsolete')]));
  expect(snapshot.entries.map((item) => item.id)).toEqual(['saved']);
});
it('does not replace a recovered catalog with a stale failure', async () => {
  let rejectFirst!: (error: Error) => void;
  io.list.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectFirst = reject;
      })
  );
  await mount();
  await act(async () => snapshot.reload());
  await act(async () => rejectFirst(new Error('Old failure')));
  expect(snapshot.status).toBe('ready');
  expect(snapshot.entries.map((item) => item.id)).toEqual(['saved']);
});
