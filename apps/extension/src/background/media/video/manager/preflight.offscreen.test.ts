import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureOffscreenDocumentReady } from './preflight.offscreen';

type EnsureOffscreenDeps = NonNullable<Parameters<typeof ensureOffscreenDocumentReady>[1]>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ensureOffscreenDocumentReady', () => {
  it('waits for readiness only when the offscreen document is not already open', async () => {
    const ensureDocument: EnsureOffscreenDeps['ensureOffscreenDocument'] = vi
      .fn()
      .mockResolvedValue(true);
    const waitForReady = vi.fn(async () => undefined);

    await ensureOffscreenDocumentReady('Recording tab video', {
      ensureOffscreenDocument: ensureDocument,
      hasOffscreenDocument: () => false,
      waitForOffscreenReady: waitForReady,
    });

    expect(ensureDocument).toHaveBeenCalledWith('Recording tab video');
    expect(waitForReady).toHaveBeenCalledOnce();
  });

  it('skips waiting when no offscreen document exists after ensure returns false', async () => {
    const ensureDocument: EnsureOffscreenDeps['ensureOffscreenDocument'] = vi
      .fn()
      .mockResolvedValue(false);
    const waitForReady = vi.fn(async () => undefined);

    await ensureOffscreenDocumentReady('Recording tab video', {
      ensureOffscreenDocument: ensureDocument,
      hasOffscreenDocument: () => false,
      waitForOffscreenReady: waitForReady,
    });

    expect(ensureDocument).toHaveBeenCalledWith('Recording tab video');
    expect(waitForReady).not.toHaveBeenCalled();
  });

  it('waits for readiness after reusing an existing offscreen document', async () => {
    const ensureDocument: EnsureOffscreenDeps['ensureOffscreenDocument'] = vi
      .fn()
      .mockResolvedValue(false);
    const waitForReady = vi.fn(async () => undefined);

    await ensureOffscreenDocumentReady('Recording tab video', {
      ensureOffscreenDocument: ensureDocument,
      hasOffscreenDocument: () => true,
      waitForOffscreenReady: waitForReady,
    });

    expect(ensureDocument).toHaveBeenCalledWith('Recording tab video');
    expect(waitForReady).toHaveBeenCalledOnce();
  });
});

it('allows a cold recording document to become ready after six seconds', async () => {
  vi.useFakeTimers();
  try {
    const pending = ensureOffscreenDocumentReady('Recording tab video', {
      ensureOffscreenDocument: async () => true,
      hasOffscreenDocument: () => true,
      waitForOffscreenReady: (timeoutMs = 5000) =>
        new Promise<void>((resolve, reject) => {
          const ready = setTimeout(() => {
            clearTimeout(deadline);
            resolve();
          }, 6000);
          const deadline = setTimeout(() => {
            clearTimeout(ready);
            reject(new Error('readiness timeout'));
          }, timeoutMs ?? 60_000);
        }),
    });
    const observed = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(6000);
    await expect(observed).resolves.toBeUndefined();
  } finally {
    vi.useRealTimers();
  }
});
