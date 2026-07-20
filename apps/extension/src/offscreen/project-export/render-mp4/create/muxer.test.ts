import { beforeEach, expect, it, vi } from 'vitest';

const { muxerInstances, targetInstances } = vi.hoisted(() => ({
  muxerInstances: [] as Array<{ options: unknown }>,
  targetInstances: [] as Array<{ id: number }>,
}));

vi.mock('mp4-muxer', () => ({
  ArrayBufferTarget: class {
    id = targetInstances.length;

    constructor() {
      targetInstances.push(this);
    }
  },
  Muxer: class {
    constructor(public options: unknown) {
      muxerInstances.push(this);
    }
  },
}));

import { buildMp4Muxer } from './muxer';

beforeEach(() => {
  muxerInstances.length = 0;
  targetInstances.length = 0;
});

it('builds muxer options with audio metadata when the pipeline has mixed audio', () => {
  const result = buildMp4Muxer(
    {
      audioProfile: { muxerCodec: 'aac' } as never,
      fallbackNotes: [],
      mixedAudio: { settings: { numberOfChannels: 2, sampleRate: 48_000 } },
      videoProfile: { muxerCodec: 'avc' } as never,
    },
    { fps: 30, height: 720, width: 1280 } as never
  );

  expect(result.target).toBe(targetInstances[0]);
  expect(muxerInstances[0]?.options).toEqual({
    audio: {
      codec: 'aac',
      numberOfChannels: 2,
      sampleRate: 48_000,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
    target: targetInstances[0],
    video: {
      codec: 'avc',
      frameRate: 30,
      height: 720,
      width: 1280,
    },
  });
});

it('omits audio muxer options when the pipeline has no audio profile', () => {
  buildMp4Muxer(
    {
      audioProfile: null,
      fallbackNotes: [],
      mixedAudio: null,
      videoProfile: { muxerCodec: 'vp9' } as never,
    },
    { fps: 24, height: 1080, width: 1920 } as never
  );

  expect(muxerInstances.at(-1)?.options).toEqual({
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
    target: targetInstances.at(-1),
    video: {
      codec: 'vp9',
      frameRate: 24,
      height: 1080,
      width: 1920,
    },
  });
});
