import { expect, it, vi } from 'vitest';
import {
  createReviewAnnotationResourceRetention,
  type ReviewPreparedAnnotationResource,
} from './annotation-resources';

function fixture() {
  let durable = new Set<string>();
  const read = vi.fn(async () => durable);
  const retention = createReviewAnnotationResourceRetention({ readDurableReferences: read });
  const resource = {
    assetId: 'project-asset:mark',
    physicalAssetId: 'physical-mark',
    publish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  } satisfies ReviewPreparedAnnotationResource;
  const local = new Set([resource.assetId]);
  return {
    retention,
    resource,
    read,
    local,
    adopt: () => {
      durable = local;
    },
  };
}

it('holds unsaved bytes without writes or durable reads and publishes only after full retained adoption', async () => {
  const { retention, resource, local, read, adopt } = fixture();
  retention.admit([resource], local);
  await retention.reconcile(local, false);
  expect(read).not.toHaveBeenCalled();
  expect(resource.publish).not.toHaveBeenCalled();
  expect(resource.cancel).not.toHaveBeenCalled();
  expect(retention.has(resource)).toBe(true);
  adopt();
  await retention.reconcile(local, true);
  expect(resource.publish).toHaveBeenCalledOnce();
  expect(resource.release).toHaveBeenCalledOnce();
  expect(retention.hasPending()).toBe(false);
});

it('keeps handles on missing adoption or failed publication for explicit Save retry', async () => {
  const { retention, resource, local, adopt } = fixture();
  retention.admit([resource], local);
  await expect(retention.reconcile(local, true)).rejects.toThrow('adoption');
  expect(resource.release).not.toHaveBeenCalled();
  expect(resource.cancel).not.toHaveBeenCalled();
  adopt();
  resource.publish.mockRejectedValueOnce(new Error('publish failed'));
  await expect(retention.reconcile(local, true)).rejects.toThrow('publish failed');
  expect(retention.has(resource)).toBe(true);
  await retention.reconcile(local, true);
  expect(resource.release).toHaveBeenCalledOnce();
});

it('reads only admitted resources and suppresses a result released while its physical read is pending', async () => {
  const { retention, resource, local, read } = fixture();
  let finish!: (blob: Blob) => void;
  const reading = vi.fn(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      })
  );
  const readable = { ...resource, read: reading };
  const signal = new AbortController().signal;
  expect(await retention.read(resource.assetId, signal)).toBeNull();
  expect(reading).not.toHaveBeenCalled();
  retention.admit([readable], local);
  const pending = retention.read(resource.assetId, signal);
  await retention.reconcile(new Set(), false);
  finish(new Blob(['private'], { type: 'image/png' }));
  expect(await pending).toBeNull();
  expect(read).toHaveBeenCalledOnce();
  expect(readable.cancel).toHaveBeenCalledOnce();
  expect(readable.release).toHaveBeenCalledOnce();
  expect(await retention.read(resource.assetId, signal)).toBeNull();
});

it('retained reads honor cancellation and become unavailable on actual disposal', async () => {
  const { retention, resource, local } = fixture();
  const blob = new Blob(['private'], { type: 'image/png' });
  const readable = { ...resource, read: vi.fn(async () => blob) };
  retention.admit([readable], local);
  expect(await retention.read(resource.assetId, new AbortController().signal)).toBe(blob);
  const controller = new AbortController();
  controller.abort();
  await expect(retention.read(resource.assetId, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(readable.read).toHaveBeenCalledOnce();
  await retention.dispose();
  expect(await retention.read(resource.assetId, new AbortController().signal)).toBeNull();
});

it('uses the canonical reader after publication while retaining staged ownership', async () => {
  const { retention, resource, local } = fixture();
  const readable = {
    ...resource,
    read: vi.fn(async (): Promise<Blob> => {
      throw new Error('unavailable');
    }),
  };
  retention.admit([readable], local);
  expect(await retention.read(resource.assetId, new AbortController().signal)).toBeNull();
  expect(retention.has(readable)).toBe(true);
  expect(resource.cancel).not.toHaveBeenCalled();
  expect(resource.release).not.toHaveBeenCalled();
  await retention.dispose();
});

it.each([false, true])(
  'dropping local references checks full durable history, adopted=%s',
  async (adopted) => {
    const { retention, resource, local, adopt } = fixture();
    retention.admit([resource], local);
    if (adopted) adopt();
    await retention.reconcile(new Set(), false);
    expect(resource.publish).toHaveBeenCalledTimes(adopted ? 1 : 0);
    expect(resource.cancel).toHaveBeenCalledTimes(adopted ? 0 : 1);
    expect(resource.release).toHaveBeenCalledOnce();
  }
);

it('rejects foreign, duplicate and competing handles without partial ownership transfer', () => {
  const { retention, resource, local } = fixture();
  expect(() => retention.admit([resource], new Set())).toThrow('ownership');
  expect(() => retention.admit([resource, resource], local)).toThrow('ownership');
  expect(retention.hasPending()).toBe(false);
  retention.admit([resource], local);
  expect(() => retention.admit([{ ...resource, physicalAssetId: 'replacement' }], local)).toThrow(
    'ownership'
  );
  expect(retention.has(resource)).toBe(true);
});

it.each(['unadopted', 'adopted', 'unknown'] as const)(
  'disposal preserves %s durable ownership and releases its page lease',
  async (state) => {
    const { retention, resource, local, adopt, read } = fixture();
    retention.admit([resource], local);
    if (state === 'adopted') adopt();
    if (state === 'unknown') read.mockRejectedValue(new Error('read unavailable'));
    const first = retention.dispose();
    expect(retention.dispose()).toBe(first);
    if (state === 'unknown') await expect(first).rejects.toThrow('deferred');
    else await first;
    expect(resource.publish).toHaveBeenCalledTimes(state === 'adopted' ? 1 : 0);
    expect(resource.cancel).toHaveBeenCalledTimes(state === 'unadopted' ? 1 : 0);
    expect(resource.release).toHaveBeenCalledOnce();
    expect(() => retention.admit([resource], local)).toThrow('closed');
  }
);

it('failed disposal releases exclusion and retains recovery without cancellation', async () => {
  const { retention, resource, local, adopt } = fixture();
  retention.admit([resource], local);
  adopt();
  resource.publish.mockRejectedValueOnce(new Error('publish unavailable'));
  await expect(retention.dispose()).rejects.toThrow('deferred');
  expect(resource.cancel).not.toHaveBeenCalled();
  expect(resource.release).toHaveBeenCalledOnce();
});
