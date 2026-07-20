import { expect, it, vi } from 'vitest';

import { createEffectAudioBufferCache } from './buffer-cache';
import {
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../runtime/resource-limits';

function buffer(frames = 48_000) {
  return { length: frames, numberOfChannels: 2, sampleRate: 48_000 };
}

it('deduplicates in-flight decode and retains one byte-accounted entry', async () => {
  const cache = createEffectAudioBufferCache();
  const decode = vi.fn(async () => buffer());

  const [first, second] = await Promise.all([
    cache.loadOrDecode('tone', decode),
    cache.loadOrDecode('tone', decode),
  ]);

  expect(first).toBe(second);
  expect(decode).toHaveBeenCalledOnce();
  expect(cache.snapshot()).toEqual({ active: 0, entries: 1, pending: 0, retainedBytes: 384_000 });
});

it('bounds decode concurrency and rejects work beyond the fixed queue', async () => {
  const cache = createEffectAudioBufferCache();
  const resolvers: Array<(value: ReturnType<typeof buffer>) => void> = [];
  const decode = () => new Promise<ReturnType<typeof buffer>>((resolve) => resolvers.push(resolve));
  const accepted = Array.from(
    {
      length:
        EFFECT_RUNTIME_RESOURCE_LIMITS.maxAudioDecodeConcurrency +
        EFFECT_RUNTIME_RESOURCE_LIMITS.maxAudioDecodeQueueDepth,
    },
    (_, index) => cache.loadOrDecode(`tone-${index}`, decode)
  );

  await expect(cache.loadOrDecode('overflow', decode)).rejects.toBeInstanceOf(
    EffectRuntimeResourceError
  );
  while (resolvers.length > 0 || cache.snapshot().active > 0 || cache.snapshot().pending > 0) {
    resolvers.shift()?.(buffer());
    await Promise.resolve();
  }
  await Promise.all(accepted);
});

it('does not retain a late decode result after disposal', async () => {
  const cache = createEffectAudioBufferCache();
  let resolve!: (value: ReturnType<typeof buffer>) => void;
  const decoded = cache.loadOrDecode('tone', () => new Promise((done) => (resolve = done)));
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  cache.dispose();
  resolve(buffer());

  await expect(decoded).resolves.toEqual(buffer());
  expect(cache.snapshot()).toEqual({ active: 0, entries: 0, pending: 0, retainedBytes: 0 });
});
