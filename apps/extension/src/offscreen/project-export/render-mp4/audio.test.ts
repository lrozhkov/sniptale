import { beforeEach, expect, it, vi } from 'vitest';

const encodeOfflineAudioBufferMock = vi.hoisted(() => vi.fn());

vi.mock('../offline-audio', () => ({
  encodeOfflineAudioBuffer: encodeOfflineAudioBufferMock,
}));

import { encodeMp4AudioIfPresent } from './audio';

beforeEach(() => {
  encodeOfflineAudioBufferMock.mockReset();
});

it('skips audio encoding when the encoder or mixed audio is missing', async () => {
  await encodeMp4AudioIfPresent({
    audioEncoder: null,
    pipeline: { mixedAudio: null } as never,
    throwIfPipelineFailed: vi.fn(),
  });

  expect(encodeOfflineAudioBufferMock).not.toHaveBeenCalled();
});

it('encodes the mixed audio buffer when present', async () => {
  const throwIfPipelineFailed = vi.fn();

  await encodeMp4AudioIfPresent({
    audioEncoder: {} as AudioEncoder,
    pipeline: {
      mixedAudio: {
        buffer: { id: 'audio-buffer' },
        settings: { numberOfChannels: 2, sampleRate: 48_000 },
      },
    } as never,
    throwIfPipelineFailed,
  });

  expect(encodeOfflineAudioBufferMock).toHaveBeenCalledOnce();
  expect(encodeOfflineAudioBufferMock).toHaveBeenCalledWith(
    { id: 'audio-buffer' },
    { numberOfChannels: 2, sampleRate: 48_000 },
    expect.any(Object),
    throwIfPipelineFailed,
    undefined
  );
});
