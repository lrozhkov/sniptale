import { expect, it, vi } from 'vitest';

class FakeAudioData {
  close = vi.fn();

  constructor(readonly init: Record<string, unknown>) {}
}

const { waitForEncoderQueueCapacityMock } = vi.hoisted(() => ({
  waitForEncoderQueueCapacityMock: vi.fn(),
}));

vi.mock('../codecs', () => ({
  waitForEncoderQueueCapacity: waitForEncoderQueueCapacityMock,
}));

vi.stubGlobal('AudioData', FakeAudioData);

function createAudioBuffer(channels: number, sampleRate: number, length: number) {
  const channelData = Array.from({ length: channels }, () => new Float32Array(length).fill(0.5));
  return {
    length,
    numberOfChannels: channels,
    sampleRate,
    getChannelData: (channel: number) => channelData[channel],
  } as AudioBuffer;
}

it('encodes audio in fixed-size planar chunks', async () => {
  const { encodeOfflineAudioBuffer } = await import('./encode-buffer');
  const encode = vi.fn();
  const throwIfPipelineFailed = vi.fn();

  waitForEncoderQueueCapacityMock.mockResolvedValue(undefined);
  await encodeOfflineAudioBuffer(
    createAudioBuffer(2, 48_000, 2_050),
    { numberOfChannels: 2, sampleRate: 48_000 },
    { encode } as never,
    throwIfPipelineFailed
  );

  expect(waitForEncoderQueueCapacityMock).toHaveBeenCalled();
  expect(encode).toHaveBeenCalledTimes(3);
});

it('stops chunk emission when aborted', async () => {
  const { encodeOfflineAudioBuffer } = await import('./encode-buffer');
  const controller = new AbortController();
  controller.abort();

  await expect(
    encodeOfflineAudioBuffer(
      createAudioBuffer(2, 48_000, 10),
      { numberOfChannels: 2, sampleRate: 48_000 },
      { encode: vi.fn() } as never,
      vi.fn(),
      controller.signal
    )
  ).rejects.toThrow('The export was aborted.');
});
