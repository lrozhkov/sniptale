import { beforeEach, expect, it, vi } from 'vitest';
import { LocalOnlySwitchError, switchLibraryToLocalOnly } from './local-only';
import type { RetainedLibraryPlan } from './retained-library';
const io = vi.hoisted(() => ({
  prepare: vi.fn(),
  roots: vi.fn(),
  native: vi.fn(),
  detach: vi.fn(),
  reading: false,
}));
vi.mock('../../composition/persistence/assets/resource-sessions', () => ({
  runWithAssetResourceRead: async (operation: () => Promise<unknown>) => {
    io.reading = true;
    try {
      return await operation();
    } finally {
      io.reading = false;
    }
  },
}));
vi.mock('./retained-library', () => ({
  prepareRetainedLibrary: io.prepare,
  readRetainedNativeRoots: io.roots,
}));
vi.mock('./editing-admission', () => ({ ensureNativeBackupRootAvailable: io.native }));
vi.mock('../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({ switchToLocalOnly: io.detach }),
}));
const plan: RetainedLibraryPlan = {
  binding: {
    provider: 'webdav',
    rootUrl: 'https://dav.test/root/',
    accountId: 'user',
    spaceId: 'space',
    profileCreatedAt: 1,
    connectionGeneration: 1,
  },
  authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
  missing: [],
  nativeRootCount: 2,
  remoteBytesUpperBound: 0,
};
const roots = [
  { rootKind: 'video-project', rootId: 'saved' },
  { rootKind: 'media', rootId: 'trash' },
];
beforeEach(() => {
  vi.resetAllMocks();
  io.reading = false;
  io.prepare.mockResolvedValue(undefined);
  io.roots.mockResolvedValue(roots);
  io.native.mockResolvedValue(undefined);
  io.detach.mockResolvedValue({ kind: 'local-only', history: 'delivered' });
});
it('prepares catalog-only and every retained native backup closure under one reader before retirement', async () => {
  const events: string[] = [];
  io.prepare.mockImplementation(async () => {
    expect(io.reading).toBe(true);
    events.push('catalog');
  });
  io.native.mockImplementation(async (root) => {
    expect(io.reading).toBe(true);
    events.push(root.rootId);
  });
  io.detach.mockImplementation(async () => {
    expect(io.reading).toBe(true);
    events.push('detach');
    return { kind: 'local-only', history: 'delivered' };
  });
  await switchLibraryToLocalOnly(plan);
  expect(events).toEqual(['catalog', 'saved', 'trash', 'detach']);
  expect(io.detach).toHaveBeenCalledExactlyOnceWith(plan.authorization);
  expect(io.reading).toBe(false);
});
it.each(['catalog', 'native'])(
  'preserves authority after %s preparation refuses',
  async (stage) => {
    (stage === 'catalog' ? io.prepare : io.native).mockRejectedValueOnce(new Error('unavailable'));
    await expect(switchLibraryToLocalOnly(plan)).rejects.toThrow('unavailable');
    expect(io.detach).not.toHaveBeenCalled();
    expect(io.reading).toBe(false);
  }
);
it('keeps the reader until cancelled native preparation settles and never retires authority', async () => {
  let finish!: () => void;
  io.native.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  const abort = new AbortController();
  const operation = switchLibraryToLocalOnly(plan, abort.signal);
  const observed = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(io.native).toHaveBeenCalledOnce());
  abort.abort();
  expect(io.reading).toBe(true);
  expect(io.detach).not.toHaveBeenCalled();
  finish();
  await observed;
  expect(io.reading).toBe(false);
});
it('reports a committed detach even if cancellation arrives after its atomic boundary', async () => {
  const abort = new AbortController();
  io.detach.mockImplementation(async () => {
    abort.abort();
    return { kind: 'local-only', history: 'delivered' };
  });
  await expect(switchLibraryToLocalOnly(plan, abort.signal)).resolves.toBe('delivered');
});

it('preserves the native refusal code and releases the preparation reader', async () => {
  io.detach.mockResolvedValue({ kind: 'local-only-refused', code: 'pending-outgoing' });
  await expect(switchLibraryToLocalOnly(plan)).rejects.toMatchObject({
    name: 'Error',
    code: 'pending-outgoing',
  });
  await expect(switchLibraryToLocalOnly(plan)).rejects.toBeInstanceOf(LocalOnlySwitchError);
  expect(io.reading).toBe(false);
});

it('refuses an unexpected runtime result without retaining the reader', async () => {
  io.detach.mockResolvedValue({ kind: 'accepted', requestId: 'unexpected' });
  await expect(switchLibraryToLocalOnly(plan)).rejects.toThrow('Local-only transition refused');
  expect(io.reading).toBe(false);
});

it('reports an incomplete history after a successful native detach', async () => {
  io.detach.mockResolvedValue({ kind: 'local-only', history: 'incomplete' });
  await expect(switchLibraryToLocalOnly(plan)).resolves.toBe('incomplete');
  expect(io.detach).toHaveBeenCalledExactlyOnceWith(plan.authorization);
  expect(io.reading).toBe(false);
});
