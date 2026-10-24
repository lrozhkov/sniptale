import { describe, expect, it, vi } from 'vitest';
import type { VoiceInputPreferences } from '@sniptale/runtime-contracts/voice-input';
import {
  createHistoryFixture,
  publish,
  deferred,
} from '../../composition/persistence/voice-input-history/test-support';
import { createVoiceInputProcessingOperations, VoiceProcessingError } from './processing-operation';
import type { createVoiceInputProcessor } from './processing';

type Arguments = Parameters<ReturnType<typeof createVoiceInputProcessor>['run']>[0];
const preferences: VoiceInputPreferences = {
  language: 'ru-RU',
  microphoneDeviceId: null,
  mode: 'local-first',
  backend: 'model',
};

async function harness() {
  const history = createHistoryFixture().create();
  await history.initialize();
  const scope = await publish(history);
  const run = vi.fn<ReturnType<typeof createVoiceInputProcessor>['run']>();
  let generation = 0;
  let admitted = true;
  const operations = createVoiceInputProcessingOperations({
    history,
    processor: { run },
    acquirePermit: () => (admitted ? vi.fn() : null),
    getGeneration: () => generation,
  });
  return {
    history,
    scope,
    run,
    operations,
    revoke: () => {
      generation += 1;
      admitted = false;
    },
  };
}

describe('voice processing flight owner', () => {
  it('cancels and drains a matching owner before completing cleanup', async () => {
    const h = await harness();
    const pending = deferred();
    let args!: Arguments;
    h.run.mockImplementation(async (input) => {
      args = input;
      await pending.promise;
      input.signal.throwIfAborted();
      return h.history.get(input.scope);
    });
    const owner = {};
    const work = h.operations.run({ owner, scope: h.scope, preferences });
    const result = expect(work).rejects.toMatchObject({
      code: 'aborted',
      rawTranscript: undefined,
    });
    await Promise.resolve();
    let done = false;
    const cleanup = h.operations.cancelOwner(owner).then(() => {
      done = true;
    });
    expect(args.signal.aborted).toBe(true);
    await Promise.resolve();
    expect(done).toBe(false);
    pending.resolve();
    await cleanup;
    await result;
  });
  it('refuses egress after privacy exclusion without holding a network mutation permit', async () => {
    const h = await harness();
    const pending = deferred();
    h.run.mockImplementation(async (args) => {
      await pending.promise;
      await args.beforeSend?.();
      return h.history.get(args.scope);
    });
    const work = h.operations.run({ owner: {}, scope: h.scope, preferences });
    const result = expect(work).rejects.toMatchObject({ code: 'privacy-erasure-in-progress' });
    h.revoke();
    pending.resolve();
    await result;
  });
  it('returns raw recovery only while its latest history CAS still exists', async () => {
    const h = await harness();
    h.run.mockImplementation(async (args) => {
      args.onRawTranscript?.('accepted raw', args.scope);
      throw new Error('storage-failed');
    });
    await expect(
      h.operations.run({ owner: {}, scope: h.scope, preferences })
    ).rejects.toMatchObject({ code: 'storage-failed', rawTranscript: 'accepted raw' });
    h.run.mockImplementation(async (args) => {
      args.onRawTranscript?.('private erased', args.scope);
      await h.history.erase();
      throw new Error('storage-failed');
    });
    await expect(
      h.operations.run({ owner: {}, scope: h.scope, preferences })
    ).rejects.toMatchObject({ rawTranscript: undefined });
  });
  it('uses the latest mutation scope when cancelling a history retry for deletion', async () => {
    const h = await harness();
    const pending = deferred();
    let latest = h.scope;
    h.run.mockImplementation(async (args) => {
      latest = await h.history.beginProcessing(args.scope);
      args.onScope?.(latest);
      await pending.promise;
      const failed = await h.history.fail(latest, { status: 'cancelled', failureCode: 'aborted' });
      latest = {
        entryId: failed.entryId,
        incarnation: failed.incarnation,
        epoch: failed.epoch,
        revision: failed.revision,
        audioDigest: failed.audioDigest,
      };
      args.onScope?.(latest);
      args.signal.throwIfAborted();
      return failed;
    });
    const work = h.operations.run({ owner: {}, scope: h.scope, preferences });
    const rejection = expect(work).rejects.toBeInstanceOf(VoiceProcessingError);
    await vi.waitFor(() => expect(latest.revision).toBe(2));
    const cancelled = h.operations.cancelScope(h.scope);
    pending.resolve();
    expect(await cancelled).toEqual(latest);
    await rejection;
    await h.history.remove(latest);
    expect(await h.history.list()).toEqual([]);
  });
  it('recovers verified ASR raw when the correction deadline expires', async () => {
    vi.useFakeTimers();
    try {
      const h = await harness();
      h.run.mockImplementation(
        (args) =>
          new Promise((_resolve, reject) => {
            args.onRawTranscript?.('accepted ASR', args.scope);
            args.onPhase?.('processing-text', args.scope);
            args.signal.addEventListener('abort', () => reject(args.signal.reason), { once: true });
          })
      );
      const work = h.operations
        .run({ owner: {}, scope: h.scope, preferences })
        .catch((error: unknown) => error);

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(await work).toMatchObject({ code: 'timeout', rawTranscript: 'accepted ASR' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not invent a raw transcript when the ASR deadline expires', async () => {
    vi.useFakeTimers();
    try {
      const h = await harness();
      h.run.mockImplementation(
        (args) =>
          new Promise((_resolve, reject) => {
            args.signal.addEventListener('abort', () => reject(args.signal.reason), { once: true });
          })
      );
      const work = h.operations
        .run({ owner: {}, scope: h.scope, preferences })
        .catch((error: unknown) => error);

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(await work).toMatchObject({ code: 'timeout', rawTranscript: undefined });
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppresses deadline raw recovery when Cancel arrives during its history verification', async () => {
    vi.useFakeTimers();
    try {
      const h = await harness();
      const pending = deferred();
      const read = h.history.get.bind(h.history);
      const get = vi.spyOn(h.history, 'get').mockImplementation(async (scope) => {
        await pending.promise;
        return read(scope);
      });
      h.run.mockImplementation(
        (args) =>
          new Promise((_resolve, reject) => {
            args.onRawTranscript?.('must not deliver', args.scope);
            args.onPhase?.('processing-text', args.scope);
            args.signal.addEventListener('abort', () => reject(args.signal.reason), { once: true });
          })
      );
      const owner = {};
      const work = h.operations
        .run({ owner, scope: h.scope, preferences })
        .catch((error: unknown) => error);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(get).toHaveBeenCalledOnce();
      const cancellation = h.operations.cancelOwner(owner);
      pending.resolve();
      await cancellation;
      expect(await work).toMatchObject({ code: 'aborted', rawTranscript: undefined });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['privacy', 'erase'] as const)(
    'refuses deadline raw after %s invalidates its authority',
    async (cause) => {
      vi.useFakeTimers();
      try {
        const h = await harness();
        h.run.mockImplementation(
          (args) =>
            new Promise((_resolve, reject) => {
              args.onRawTranscript?.('private raw', args.scope);
              args.signal.addEventListener('abort', () => reject(args.signal.reason), {
                once: true,
              });
            })
        );
        const work = h.operations
          .run({ owner: {}, scope: h.scope, preferences })
          .catch((error: unknown) => error);

        await Promise.resolve();
        if (cause === 'privacy') h.revoke();
        else await h.history.erase();
        await vi.advanceTimersByTimeAsync(120_000);
        expect(await work).toMatchObject({ code: 'timeout', rawTranscript: undefined });
      } finally {
        vi.useRealTimers();
      }
    }
  );
});
