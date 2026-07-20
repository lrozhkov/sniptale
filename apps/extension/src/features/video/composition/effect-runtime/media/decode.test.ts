import { expect, it, vi } from 'vitest';

import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../runtime/resource-limits';
import { decodeEffectAudio, decodeEffectRaster, validateDecodedEffectAudio } from './decode';
import { createPngHeader } from './raster-header.test-support';
import { inspectEffectAudioContainer } from './audio-container';
import {
  createOversizedMpegBytes,
  createOversizedOggOpusBytes,
  createWavBytes,
} from './test-support';

it('checks post-decode raster dimensions and preserves an owned bitmap', async () => {
  const bitmap = createBitmap(320, 180);

  await expect(
    decodeEffectRaster(createPngHeader(320, 180), 'image/png', async () => bitmap)
  ).resolves.toEqual({
    bitmap,
    header: { height: 180, mimeType: 'image/png', width: 320 },
  });
  expect(bitmap.close).not.toHaveBeenCalled();
});

it('closes a decoded bitmap that exceeds post-decode bounds', async () => {
  const bitmap = createBitmap(4096, 4096);

  await expect(
    decodeEffectRaster(createPngHeader(320, 180), 'image/png', async () => bitmap)
  ).rejects.toEqual(expect.objectContaining({ code: 'mediaDecodeFailed' }));
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('times out and closes a bitmap that resolves after the decoder deadline', async () => {
  vi.useFakeTimers();
  const bitmap = createBitmap(320, 180);
  let resolveBitmap!: (value: ImageBitmap) => void;
  const result = decodeEffectRaster(
    createPngHeader(320, 180),
    'image/png',
    () => new Promise((resolve) => (resolveBitmap = resolve))
  );
  const rejection = expect(result).rejects.toEqual(
    expect.objectContaining({ code: 'mediaDecodeTimeout' })
  );

  await vi.advanceTimersByTimeAsync(EFFECT_RUNTIME_RESOURCE_LIMITS.mediaDecodeTimeoutMs);
  await rejection;
  resolveBitmap(bitmap);
  await Promise.resolve();
  expect(bitmap.close).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('bounds decoded PCM shape independently of document metadata', () => {
  expect(
    validateDecodedEffectAudio({ length: 48_000, numberOfChannels: 2, sampleRate: 48_000 })
  ).toBe(384_000);
  expect(() =>
    validateDecodedEffectAudio({ length: 48_000, numberOfChannels: 32, sampleRate: 48_000 })
  ).toThrow(expect.objectContaining({ code: 'mediaDecodeFailed' }));
});

it('fails a browser audio decode and a post-decode PCM overflow with typed errors', async () => {
  const wav = new Blob([createWavBytes().buffer as ArrayBuffer], { type: 'audio/wav' });
  await expect(
    decodeEffectAudio(wav, 'audio/wav', async () => {
      throw new Error('decoder rejected bytes');
    })
  ).rejects.toEqual(expect.objectContaining({ code: 'mediaDecodeFailed' }));
  await expect(
    decodeEffectAudio(
      wav,
      'audio/wav',
      async () => ({ length: 48_000, numberOfChannels: 32, sampleRate: 48_000 }) as AudioBuffer
    )
  ).rejects.toEqual(expect.objectContaining({ code: 'mediaDecodeFailed' }));
});

it('rejects an audio signature mismatch before invoking the browser decoder', async () => {
  const decode = vi.fn();

  await expect(decodeEffectAudio(new Blob(['bad']), 'audio/wav', decode)).rejects.toEqual(
    expect.objectContaining({ code: 'mediaDecodeFailed' })
  );
  expect(decode).not.toHaveBeenCalled();
});

it('rejects declared WAV, MPEG, and Ogg PCM overflows before browser decode', async () => {
  const cases = [
    ['audio/wav', createWavBytes(9)],
    ['audio/mpeg', createOversizedMpegBytes()],
    ['audio/ogg', createOversizedOggOpusBytes()],
  ] as const;
  for (const [mimeType, bytes] of cases) {
    const decode = vi.fn();
    await expect(
      decodeEffectAudio(new Blob([bytes.buffer as ArrayBuffer]), mimeType, decode)
    ).rejects.toEqual(expect.objectContaining({ code: 'mediaDecodeFailed' }));
    expect(decode).not.toHaveBeenCalled();
  }
});

it('rejects unsupported EffectV1 audio containers before browser decode', () => {
  expect(() => inspectEffectAudioContainer(createWavBytes(), 'audio/aac')).toThrow(
    'AUDIO_PROFILE_INVALID'
  );
});

function createBitmap(width: number, height: number): ImageBitmap {
  return new FakeImageBitmap(width, height);
}

class FakeImageBitmap implements ImageBitmap {
  readonly close = vi.fn();

  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}
