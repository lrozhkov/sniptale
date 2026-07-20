import { afterEach, expect, it, vi } from 'vitest';

class FakeAudioContext {
  close = vi.fn();
}

class FakeOfflineAudioContext {
  destination = { id: 'destination' };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

it('creates the offline audio mix contexts with the canonical sample rate', async () => {
  const audioContext = new FakeAudioContext();
  const offlineContext = new FakeOfflineAudioContext();
  vi.stubGlobal('AudioContext', function () {
    return audioContext;
  } as unknown as typeof AudioContext);
  vi.stubGlobal('OfflineAudioContext', function (
    _channels: number,
    _frames: number,
    sampleRate: number
  ) {
    expect(_channels).toBe(2);
    expect(_frames).toBe(96_000);
    expect(sampleRate).toBe(48_000);
    return offlineContext;
  } as unknown as typeof OfflineAudioContext);

  const { createOfflineAudioMixContext } = await import('./context');
  const context = createOfflineAudioMixContext(2);

  expect(context.decodeContext).toBe(audioContext);
  expect(context.offlineContext).toBe(offlineContext);
  expect(context.decodedBuffers.snapshot()).toEqual({
    active: 0,
    entries: 0,
    pending: 0,
    retainedBytes: 0,
  });
});

it('closes the decode context and ignores close failures', async () => {
  const audioContext = new FakeAudioContext();
  audioContext.close.mockRejectedValue(new Error('close failed'));

  const { closeOfflineAudioMixContext } = await import('./context');

  await expect(
    closeOfflineAudioMixContext(audioContext as unknown as AudioContext)
  ).resolves.toBeUndefined();
  expect(audioContext.close).toHaveBeenCalledTimes(1);
});
