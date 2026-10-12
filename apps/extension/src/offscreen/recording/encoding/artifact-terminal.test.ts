import { describe, expect, it, vi } from 'vitest';
import { createRecordingTerminal, finalizeRecordingArtifact } from './artifact-terminal';

describe('recording completion races', () => {
  it('keeps the first success or failure and exposes one unchanged terminal promise', async () => {
    const completed = createRecordingTerminal<{ size: number }>();
    const artifact = { size: 4 };
    completed.resolve(artifact);
    completed.reject(new Error('late failure'));
    completed.resolve({ size: 8 });
    expect(completed.settled).toBe(true);
    await expect(completed.promise).resolves.toBe(artifact);
    const failed = createRecordingTerminal<{ size: number }>();
    const error = new Error('first failure');
    failed.reject(error);
    failed.resolve(artifact);
    await expect(failed.promise).rejects.toBe(error);
  });
  it('rejects an empty recording before notifying publication', async () => {
    const onStop = vi.fn();
    await expect(
      finalizeRecordingArtifact(
        { finalize: async () => ({ size: 0 }) },
        'empty',
        () => true,
        onStop
      )
    ).rejects.toThrow('produced no media bytes');
    expect(onStop).not.toHaveBeenCalled();
  });
  it('does not publish after cancellation and rechecks cancellation after async notification', async () => {
    const artifact = { size: 4 };
    const writer = { finalize: vi.fn(async () => artifact) };
    const notification = vi.fn();
    await expect(
      finalizeRecordingArtifact(writer, 'aborted', () => false, notification)
    ).resolves.toBeNull();
    expect(notification).not.toHaveBeenCalled();
    let active = true;
    await expect(
      finalizeRecordingArtifact(
        writer,
        'race',
        () => active,
        async () => {
          active = false;
        }
      )
    ).resolves.toBeNull();
  });
  it('retains writer and publication failures, and returns the immutable successful artifact', async () => {
    const failure = new Error('writer failed');
    await expect(
      finalizeRecordingArtifact(
        {
          finalize: async () => {
            throw failure;
          },
        },
        'writer',
        () => true,
        undefined
      )
    ).rejects.toBe(failure);
    const artifact = { size: 1 };
    await expect(
      finalizeRecordingArtifact(
        { finalize: async () => artifact },
        'publication',
        () => true,
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);
    await expect(
      finalizeRecordingArtifact(
        { finalize: async () => artifact },
        'success',
        () => true,
        undefined
      )
    ).resolves.toBe(artifact);
  });
});
