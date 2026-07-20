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
