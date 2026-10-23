import { describe, expect, it } from 'vitest';
import { AudioSample } from 'mediabunny';
import { createLiveAudioTimestampTransform } from './live-audio-timeline';

function sample(timestamp: number, sampleRate = 48000, frames = 480) {
  return new AudioSample({
    data: new Float32Array(frames).fill(0.1875),
    format: 'f32-planar',
    numberOfChannels: 1,
    numberOfFrames: frames,
    sampleRate,
    timestamp,
  });
}

describe('live audio timestamps', () => {
  it('preserves the mapped A/V origin and PCM through positive and negative capture jitter', () => {
    const process = createLiveAudioTimestampTransform();
    for (let index = 0; index < 600; index += 1) {
      const jitter = index === 0 ? 0 : [0.0015, -0.002299, 0.002599][index % 3]!;
      const input = sample(0.37 + index * 0.01 + jitter);
      try {
        expect(process(input)).toBe(input);
        expect(input.timestamp).toBeCloseTo(0.37 + index * 0.01, 10);
        const values = new Float32Array(480);
        input.copyTo(values, { planeIndex: 0, format: 'f32-planar' });
        expect(values.every((value) => value === 0.1875)).toBe(true);
      } finally {
        input.close();
      }
    }
  });

  it.each([239, 240, 241, 480])(
    'keeps the half-packet boundary and real gaps at %i frames',
    (phase) => {
      const process = createLiveAudioTimestampTransform();
      const first = sample(0);
      const next = sample((480 + phase) / 48000);
      try {
        process(first);
        process(next);
        expect(next.timestamp).toBeCloseTo(phase < 240 ? 0.01 : (480 + phase) / 48000, 10);
      } finally {
        first.close();
        next.close();
      }
    }
  );

  it('reanchors after a real gap and preserves later continuous PCM', () => {
    const process = createLiveAudioTimestampTransform();
    for (const [timestamp, expected] of [
      [0.37, 0.37],
      [0.39, 0.39],
      [0.4015, 0.4],
      [1, 1],
      [1.009, 1.01],
    ]) {
      const input = sample(timestamp!);
      try {
        process(input);
        expect(input.timestamp).toBeCloseTo(expected!, 10);
      } finally {
        input.close();
      }
    }
  });

  it('keeps independent tracks and reanchors a changed sample rate', () => {
    const a = createLiveAudioTimestampTransform();
    const b = createLiveAudioTimestampTransform();
    const samples = [sample(0.37), sample(0.8), sample(0.5, 44100, 441), sample(0.511, 44100, 441)];
    try {
      a(samples[0]!);
      b(samples[1]!);
      a(samples[2]!);
      a(samples[3]!);
      expect(samples.map((value) => value.timestamp)).toEqual([0.37, 0.8, 0.5, 0.51]);
    } finally {
      samples.forEach((value) => value.close());
    }
  });
  it('keeps the frame-count clock stable over a long continuous segment', () => {
    const process = createLiveAudioTimestampTransform();
    const input = sample(3600);
    let maximumError = 0;
    try {
      for (let index = 0; index < 200000; index += 1) {
        const expected = 3600 + index / 100;
        input.setTimestamp(expected + (index === 0 ? 0 : index % 2 ? 0.0015 : -0.0015));
        process(input);
        maximumError = Math.max(maximumError, Math.abs(input.timestamp - expected));
      }
      expect(maximumError).toBeLessThanOrEqual(0.5 / 48000);
    } finally {
      input.close();
    }
  });
});
