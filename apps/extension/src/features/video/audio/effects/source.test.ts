import { expect, it, vi } from 'vitest';
import { createCanonicalAudioSource } from './source';
const options = () => ({
  sampleRate: 48000,
  channels: 1 as const,
  lengthFrames: 48000 * 10,
  read: vi.fn(async (first: number, last: number) => [
    Float32Array.from({ length: last - first }, (_, i) => Math.sin((first + i) / 100)),
  ]),
});
it('keeps48k samples exact for whole and arbitrarily partitioned reads', async () => {
  const source = options(),
    a = createCanonicalAudioSource(source, { start: 0.5, end: 3 }, () => {}),
    b = createCanonicalAudioSource(source, { start: 0.5, end: 3 }, () => {});
  try {
    const whole = (await a.read(0, 90000))[0]!,
      split = new Float32Array(90000);
    for (const [first, last] of [
      [0, 31],
      [31, 47999],
      [47999, 61007],
      [61007, 90000],
    ])
      split.set((await b.read(first!, last!))[0]!, first);
    expect(split).toEqual(whole);
    expect(whole[0]).toBe(Math.fround(Math.sin(24000 / 100)));
  } finally {
    a.dispose();
    b.dispose();
  }
});
it('never reads removed source content and pads EOF and requested negative frames', async () => {
  const source = options();
  source.lengthFrames = 60000;
  const reader = createCanonicalAudioSource(source, { start: 1, end: 2 }, () => {});
  try {
    const actual = (await reader.read(-128, 48000))[0]!;
    expect(actual.subarray(0, 128)).toEqual(new Float32Array(128));
    expect(actual.subarray(12128)).toEqual(new Float32Array(48000 - 12000));
    for (const [first, last] of source.read.mock.calls) {
      expect(first).toBeGreaterThanOrEqual(48000);
      expect(last).toBeLessThanOrEqual(60000);
    }
  } finally {
    reader.dispose();
  }
});
it('shares native block reads and preserves the existing bounded read budget', async () => {
  const source = options(),
    reader = createCanonicalAudioSource(source, { start: 0, end: 10 }, () => {});
  try {
    await reader.read(0, 128);
    await reader.read(128, 256);
    expect(source.read).toHaveBeenCalledTimes(1);
    await expect(reader.read(0, 192001)).rejects.toThrow('bounded');
    expect(source.read).toHaveBeenCalledTimes(1);
  } finally {
    reader.dispose();
  }
});
it('discards controlled delayed reads after cancellation', async () => {
  let cancelled = false,
    resolve!: (value: Float32Array<ArrayBuffer>[]) => void;
  const pending = new Promise<Float32Array<ArrayBuffer>[]>((done) => {
    resolve = done;
  });
  const source = options();
  source.read = vi.fn((_first: number, _last: number) => pending);
  const reader = createCanonicalAudioSource(source, { start: 0, end: 1 }, () => {
    if (cancelled) throw new Error('cancelled');
  });
  const request = reader.read(0, 128);
  await Promise.resolve();
  cancelled = true;
  resolve([new Float32Array(48000)]);
  await expect(request).rejects.toThrow('cancelled');
  reader.dispose();
});
it('retries a failed native window without retaining a rejected cache entry', async () => {
  const source = options();
  source.read.mockRejectedValueOnce(new Error('decoder failed'));
  const reader = createCanonicalAudioSource(source, { start: 0, end: 1 }, () => {});
  try {
    await expect(reader.read(0, 128)).rejects.toThrow('decoder failed');
    expect((await reader.read(0, 128))[0]!.length).toBe(128);
    expect(source.read).toHaveBeenCalledTimes(2);
  } finally {
    reader.dispose();
  }
});
it('rejects invalid PCM without publishing a partial read', async () => {
  const source = options();
  source.read.mockResolvedValueOnce([new Float32Array(1)]);
  const reader = createCanonicalAudioSource(source, { start: 0, end: 1 }, () => {});
  try {
    await expect(reader.read(0, 128)).rejects.toThrow('invalid audio PCM');
  } finally {
    reader.dispose();
  }
});
it('refuses invalid source metadata and reads after disposal without consulting the decoder', async () => {
  const source = options();
  expect(() =>
    createCanonicalAudioSource({ ...source, sampleRate: 0 }, { start: 0, end: 1 }, () => {})
  ).toThrow('Invalid audio PCM');
  expect(() =>
    createCanonicalAudioSource(source, { start: 0, end: Number.MAX_VALUE }, () => {})
  ).toThrow('frame count');
  const reader = createCanonicalAudioSource(source, { start: 0, end: 1 }, () => {});
  reader.dispose();
  await expect(reader.read(0, 128)).rejects.toThrow('disposed');
  expect(source.read).not.toHaveBeenCalled();
});
it('releases the SRC node after rendering succeeds or fails, retaining the central output second', async () => {
  for (const fail of [false, true]) {
    const disconnect = vi.fn();
    const node = {
      buffer: null as { getChannelData(channel: number): Float32Array } | null,
      connect: vi.fn(),
      start: vi.fn(),
      disconnect,
    };
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        destination = {};
        createBuffer(_channels: number, frames: number) {
          return { getChannelData: () => new Float32Array(frames) };
        }
        createBufferSource() {
          return node;
        }
        async startRendering() {
          if (fail) throw new Error('SRC rendering failed');
          return {
            getChannelData: () => Float32Array.from({ length: 144000 }, (_, index) => index),
          };
        }
      }
    );
    const source = { ...options(), sampleRate: 44100 };
    const reader = createCanonicalAudioSource(source, { start: 0, end: 2 }, () => {});
    try {
      if (fail) await expect(reader.read(0, 128)).rejects.toThrow('SRC rendering failed');
      else
        expect((await reader.read(0, 128))[0]).toEqual(
          Float32Array.from({ length: 128 }, (_, i) => 48000 + i)
        );
      expect(disconnect).toHaveBeenCalledOnce();
      expect(node.buffer).toBeNull();
      expect(source.read.mock.calls[0]).toEqual([0, 88200]);
    } finally {
      reader.dispose();
      vi.unstubAllGlobals();
    }
  }
});
it('refuses SRC when its browser capability is unavailable and never reads native PCM', async () => {
  vi.stubGlobal('OfflineAudioContext', undefined);
  const source = { ...options(), sampleRate: 44100 };
  const reader = createCanonicalAudioSource(source, { start: 0, end: 1 }, () => {});
  try {
    await expect(reader.read(0, 128)).rejects.toThrow('conversion is unavailable');
    expect(source.read).not.toHaveBeenCalled();
  } finally {
    reader.dispose();
    vi.unstubAllGlobals();
  }
});
