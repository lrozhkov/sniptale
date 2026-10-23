// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  load: vi.fn(),
  edit: vi.fn(),
  list: vi.fn(),
  retain: vi.fn(),
  off: vi.fn(),
  mediaOff: vi.fn(),
  changed: () => {},
  mediaChanged: (_event: { type: string }) => {},
}));
vi.mock('../persistence/background-presets/catalog', () => ({
  createBackgroundPresetCatalog: () => ({
    load: io.load,
    edit: io.edit,
    subscribe: (callback: () => void) => {
      io.changed = callback;
      return io.off;
    },
  }),
}));
vi.mock('../persistence/media-library', () => ({ listMediaLibrary: io.list }));
vi.mock('./acquisition', () => ({ retainBackgroundInLibrary: io.retain }));
vi.mock('../../features/media-hub/events', () => ({
  subscribeToMediaHubEvents: (callback: typeof io.mediaChanged) => {
    io.mediaChanged = callback;
    return io.mediaOff;
  },
}));
vi.mock('../../platform/i18n', () => ({ useAppLocale: () => 'ru' }));
import { useBackgroundCatalog } from './catalog';
let value: ReturnType<typeof useBackgroundCatalog>;
let root: Root;
let host: HTMLDivElement;
function Harness() {
  value = useBackgroundCatalog();
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.load.mockResolvedValue({
    presets: [
      { id: 'builtin:cobalt-silk', enabled: true },
      { id: 'user:a', name: 'Mine', mediaId: 'a', enabled: true },
      { id: 'user:b', name: 'Gone', mediaId: 'b', enabled: true },
    ],
  });
  io.list.mockResolvedValue([
    { id: 'a', kind: 'image' },
    { id: 'b', kind: 'image', lifecycle: { trashedAt: 1 } },
  ]);
  io.edit.mockResolvedValue(undefined);
  io.retain.mockResolvedValue('a');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('localizes built-ins, tracks availability and persists additions through one catalog', async () => {
  await act(async () => root.render(<Harness />));
  expect(value.status).toBe('ready');
  expect(value.presets.map((row) => row.available)).toEqual([true, true, false]);
  expect(value.presets[0]?.name).toBe('Кобальтовый шёлк');
  await act(async () => value.edit({ type: 'toggle', id: 'user:a' }));
  expect(io.edit).toHaveBeenCalledWith({ type: 'toggle', id: 'user:a' });
  await act(async () => value.add({ file: new File(['x'], 'Mine.png') }));
  expect(io.edit).toHaveBeenLastCalledWith({ type: 'add', mediaId: 'a', name: 'Mine' });
  await act(async () => io.changed());
  await act(async () => io.mediaChanged({ type: 'library-changed' }));
  expect(io.load).toHaveBeenCalledTimes(5);
});
it('reports failed reads and does not publish an older refresh over a newer result', async () => {
  io.load.mockRejectedValueOnce(new Error('offline'));
  await act(async () => root.render(<Harness />));
  expect(value.status).toBe('failed');
  let resolveOld!: (value: { presets: [] }) => void;
  io.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      })
  );
  let old!: Promise<void>;
  await act(async () => {
    old = value.reload();
  });
  await act(async () => value.reload());
  await act(async () => {
    resolveOld({ presets: [] });
    await old;
  });
  expect(value.presets).toHaveLength(3);
  expect(value.status).toBe('ready');
});
it('unsubscribes and ignores a read finishing after disposal', async () => {
  let resolve!: (value: { presets: [] }) => void;
  io.load.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await act(async () => root.render(<Harness />));
  await act(async () => root.unmount());
  await act(async () => resolve({ presets: [] }));
  expect(io.off).toHaveBeenCalled();
  expect(io.mediaOff).toHaveBeenCalled();
  root = createRoot(host);
});

it('uses the supplied background name in the original add transaction', async () => {
  await act(async () => root.render(<Harness />));
  await act(async () => value.add({ file: new File(['x'], 'Mine.png') }, '  My background  '));
  expect(io.edit).toHaveBeenLastCalledWith({ type: 'add', mediaId: 'a', name: 'My background' });
});

it('keeps each supplied name attached to its media when parallel acquisitions finish out of order', async () => {
  await act(async () => root.render(<Harness />));
  let finishFirst!: (id: string) => void;
  let finishSecond!: (id: string) => void;
  io.retain.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finishFirst = resolve;
      })
  );
  io.retain.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finishSecond = resolve;
      })
  );
  const first = value.add({ file: new File(['a'], 'one.png') }, 'First name');
  const second = value.add({ file: new File(['b'], 'two.png') }, 'Second name');
  await act(async () => {
    finishSecond('second-media');
    await second;
  });
  await act(async () => {
    finishFirst('first-media');
    await first;
  });
  expect(io.edit.mock.calls.map(([edit]) => edit)).toEqual([
    { type: 'add', mediaId: 'second-media', name: 'Second name' },
    { type: 'add', mediaId: 'first-media', name: 'First name' },
  ]);
});

it('retains the catalog and supplied name when an add is refused and the user retries', async () => {
  await act(async () => root.render(<Harness />));
  const original = value.presets;
  io.edit.mockRejectedValueOnce(new Error('refused'));
  const image = { file: new File(['x'], 'source.png') };
  await expect(value.add(image, 'Chosen name')).rejects.toThrow('refused');
  expect(value.presets).toBe(original);
  await act(async () => value.add(image, 'Chosen name'));
  expect(io.edit).toHaveBeenNthCalledWith(1, { type: 'add', mediaId: 'a', name: 'Chosen name' });
  expect(io.edit).toHaveBeenNthCalledWith(2, { type: 'add', mediaId: 'a', name: 'Chosen name' });
});
