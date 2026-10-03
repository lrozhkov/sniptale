import { afterEach, expect, it, vi } from 'vitest';
import { createMediaThumbFallbackItem } from './fallback-items';
import { createGalleryThumbnailResources } from './thumbnail-resources';

const thumbnail = () => ({ blob: new Blob(['cover']), width: 320, height: 180 });
afterEach(() => vi.restoreAllMocks());

it('shares reads and URLs, keeps live consumers, and reuses a warm released thumbnail', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shared');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const load = vi.fn().mockResolvedValue(thumbnail());
  const resources = createGalleryThumbnailResources(load);
  const item = createMediaThumbFallbackItem('image', 'one');
  const first = resources.acquire(item);
  const second = resources.acquire(item);
  expect(await first.url).toBe(await second.url);
  first.release();
  expect(revoke).not.toHaveBeenCalled();
  second.release();
  const warm = resources.acquire(item);
  expect(await warm.url).toBe('blob:shared');
  expect(load).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledOnce();
  warm.release();
  resources.dispose();
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:shared');
});

it('aborts the final pending consumer and rejects late completion after disposal', async () => {
  const create = vi.spyOn(URL, 'createObjectURL');
  let complete: (value: ReturnType<typeof thumbnail>) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<ReturnType<typeof thumbnail>>((resolve) => {
        complete = resolve;
      })
  );
  const resources = createGalleryThumbnailResources(load);
  const lease = resources.acquire(createMediaThumbFallbackItem('image', 'pending'));
  resources.dispose();
  complete(thumbnail());
  expect(await lease.url).toBeNull();
  expect(create).not.toHaveBeenCalled();
  lease.release();
});

it.each([
  { entries: 1, bytes: 1000000, decodedBytes: 1000000 },
  { entries: 20, bytes: 5, decodedBytes: 1000000 },
  { entries: 20, bytes: 1000000, decodedBytes: 320 * 180 * 4 },
])('evicts idle resources by budget without revoking an active image: %j', async (limits) => {
  let serial = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++serial}`);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const resources = createGalleryThumbnailResources(async () => thumbnail(), limits);
  const leases = ['a', 'b', 'c'].map((id) =>
    resources.acquire(createMediaThumbFallbackItem('image', id))
  );
  await Promise.all(leases.map((lease) => lease.url));
  leases[0]!.release();
  leases[1]!.release();
  expect(revoke).toHaveBeenCalledWith('blob:1');
  expect(revoke).not.toHaveBeenCalledWith('blob:3');
  resources.dispose();
});

it('does not reuse a resource from an older snapshot with the same material id', async () => {
  let serial = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++serial}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const load = vi.fn().mockResolvedValue(thumbnail());
  const resources = createGalleryThumbnailResources(load);
  const item = createMediaThumbFallbackItem('image', 'same');
  const old = resources.acquire(item);
  expect(await old.url).toBe('blob:1');
  old.release();
  const changed = resources.acquire({ ...item, workspaceRevision: 2 });
  expect(await changed.url).toBe('blob:2');
  resources.dispose();
});

it('invalidates warm retention even when a refreshed material has the same UI identity', async () => {
  let serial = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++serial}`);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const load = vi.fn().mockResolvedValue(thumbnail());
  const resources = createGalleryThumbnailResources(load);
  const item = createMediaThumbFallbackItem('image', 'same-revision');
  const visible = resources.acquire(item);
  await visible.url;
  resources.invalidate();
  expect(revoke).not.toHaveBeenCalled();
  visible.release();
  expect(revoke).toHaveBeenCalledWith('blob:1');
  const updated = resources.acquire(item);
  expect(await updated.url).toBe('blob:2');
  updated.release();
  resources.invalidate();
  expect(revoke).toHaveBeenCalledWith('blob:2');
  const fresh = resources.acquire(item);
  expect(await fresh.url).toBe('blob:3');
  expect(load).toHaveBeenCalledTimes(3);
  resources.dispose();
});
