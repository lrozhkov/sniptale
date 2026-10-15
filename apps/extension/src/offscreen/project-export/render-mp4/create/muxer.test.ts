import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EncodedPacket } from 'mediabunny';
import {
  VideoMp4Codec,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types/export';

const { videoAdd, audioAdd, start, finalize, cancel, outputs, formats, videos, audios } =
  vi.hoisted(() => ({
    videoAdd: vi.fn(),
    audioAdd: vi.fn(),
    start: vi.fn(),
    finalize: vi.fn(),
    cancel: vi.fn(),
    outputs: [] as Array<{
      options: unknown;
      addVideoTrack: ReturnType<typeof vi.fn>;
      addAudioTrack: ReturnType<typeof vi.fn>;
    }>,
    formats: [] as Array<{ options: unknown }>,
    videos: [] as Array<{ codec: string }>,
    audios: [] as Array<{ codec: string }>,
  }));

vi.mock('mediabunny', async (importOriginal) => ({
  ...(await importOriginal<typeof import('mediabunny')>()),
  BufferTarget: class {
    buffer: ArrayBuffer | null = null;
  },
  Mp4OutputFormat: class {
    constructor(public options: unknown) {
      formats.push(this);
    }
  },
  EncodedVideoPacketSource: class {
    add = videoAdd;
    constructor(public codec: string) {
      videos.push(this);
    }
  },
  EncodedAudioPacketSource: class {
    add = audioAdd;
    constructor(public codec: string) {
      audios.push(this);
    }
  },
  Output: class {
    addVideoTrack = vi.fn();
    addAudioTrack = vi.fn();
    start = start;
    finalize = finalize;
    cancel = cancel;
    constructor(public options: unknown) {
      outputs.push(this);
    }
  },
}));

import { buildMp4Muxer } from './muxer';
import type { Mp4PipelineProfiles } from './types';

class Chunk {
  byteLength = 3;
  type = 'key';
  constructor(
    public timestamp: number,
    public duration = 33_333
  ) {}
  copyTo(destination: Uint8Array) {
    destination.set([1, 2, 3]);
  }
}

const profiles: Mp4PipelineProfiles = {
  audioProfile: {
    muxerCodec: 'aac',
    label: 'AAC',
    config: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2 },
  },
  fallbackNotes: [],
  mixedAudio: { buffer: {} as AudioBuffer, settings: { numberOfChannels: 2, sampleRate: 48_000 } },
  videoProfile: {
    muxerCodec: 'avc',
    codec: VideoMp4Codec.AVC,
    label: 'AVC',
    config: { codec: 'avc1.42001f', width: 1280, height: 720 },
  },
};
const settings = { fps: 30, height: 720, width: 1280 } as VideoProjectExportSettings;
const chunk = (timestamp: number) => new Chunk(timestamp) as unknown as EncodedVideoChunk;

beforeEach(() => {
  vi.clearAllMocks();
  outputs.length = formats.length = videos.length = audios.length = 0;
  start.mockResolvedValue(undefined);
  finalize.mockResolvedValue(undefined);
  cancel.mockResolvedValue(undefined);
  videoAdd.mockResolvedValue(undefined);
  audioAdd.mockResolvedValue(undefined);
  vi.stubGlobal('EncodedVideoChunk', Chunk);
  vi.stubGlobal('EncodedAudioChunk', Chunk);
});
afterEach(() => vi.unstubAllGlobals());

it('registers both tracks before awaiting startup, with fixed frame timing', async () => {
  const result = await buildMp4Muxer(profiles, settings);
  expect(formats[0]?.options).toEqual({ fastStart: 'in-memory' });
  expect(videos[0]?.codec).toBe('avc');
  expect(audios[0]?.codec).toBe('aac');
  expect(outputs[0]?.addVideoTrack).toHaveBeenCalledWith(videos[0], { frameRate: 30 });
  expect(outputs[0]?.addAudioTrack).toHaveBeenCalledWith(audios[0]);
  expect(outputs[0]?.addAudioTrack.mock.invocationCallOrder[0]).toBeLessThan(
    start.mock.invocationCallOrder[0]!
  );
  expect(result.target.buffer).toBeNull();
});

it.each(['avc', 'hevc', 'vp9'] as const)(
  'preserves %s and omits the absent audio track',
  async (muxerCodec) => {
    await buildMp4Muxer(
      {
        ...profiles,
        audioProfile: null,
        mixedAudio: null,
        videoProfile: { ...profiles.videoProfile, muxerCodec },
      },
      settings
    );
    expect(videos[0]?.codec).toBe(muxerCodec);
    expect(outputs[0]?.addAudioTrack).not.toHaveBeenCalled();
  }
);

it('retains fragmented VFR without frame-rate snapping and Opus fallback', async () => {
  await buildMp4Muxer(
    { ...profiles, audioProfile: { ...profiles.audioProfile!, muxerCodec: 'opus' } },
    { ...settings, frameRateMode: 'adaptive' }
  );
  expect(formats[0]?.options).toEqual({ fastStart: 'fragmented' });
  expect(outputs[0]?.addVideoTrack).toHaveBeenCalledWith(videos[0], {});
  expect(audios[0]?.codec).toBe('opus');
});

it('copies packet bytes and preserves duration, metadata and per-track first-timestamp offsets', async () => {
  const { muxer } = await buildMp4Muxer(profiles, settings);
  const videoMeta = { decoderConfig: { codec: 'avc1.42001f', codedWidth: 1280, codedHeight: 720 } };
  const audioMeta = {
    decoderConfig: { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2 },
  };
  await muxer.addVideoChunk(chunk(2_000_000), videoMeta);
  await muxer.addVideoChunk(chunk(2_200_000), undefined);
  await muxer.addAudioChunk(chunk(-20_000) as unknown as EncodedAudioChunk, audioMeta);
  await muxer.addAudioChunk(chunk(0) as unknown as EncodedAudioChunk);
  const firstVideo = videoAdd.mock.calls[0]![0] as EncodedPacket;
  expect(firstVideo.data).toEqual(new Uint8Array([1, 2, 3]));
  expect(firstVideo.duration).toBe(0.033333);
  expect(videoAdd.mock.calls.map(([packet]) => packet.timestamp)).toEqual([0, 0.2]);
  expect(audioAdd.mock.calls.map(([packet]) => packet.timestamp)).toEqual([0, 0.02]);
  expect(videoAdd.mock.calls[0]![1]).toBe(videoMeta);
  expect(audioAdd.mock.calls[0]![1]).toBe(audioMeta);
});

it('drains ordered packet writes before finalizing exactly once', async () => {
  let release: (() => void) | undefined;
  videoAdd.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  const { muxer } = await buildMp4Muxer(profiles, settings);
  const videoWrite = muxer.addVideoChunk(chunk(0));
  const audioWrite = muxer.addAudioChunk(chunk(0) as unknown as EncodedAudioChunk);
  const completed = muxer.finalize();
  expect(muxer.finalize()).toBe(completed);
  await vi.waitFor(() => expect(videoAdd).toHaveBeenCalledOnce());
  expect(audioAdd).not.toHaveBeenCalled();
  expect(finalize).not.toHaveBeenCalled();
  release!();
  await Promise.all([videoWrite, audioWrite, completed]);
  expect(audioAdd).toHaveBeenCalledOnce();
  expect(finalize).toHaveBeenCalledOnce();
  expect(() => muxer.addVideoChunk(chunk(33_333))).toThrow('closed');
});

it('retains the first asynchronous write failure and never finalizes a broken container', async () => {
  const failure = new Error('packet rejected');
  videoAdd.mockRejectedValueOnce(failure);
  const { muxer } = await buildMp4Muxer(profiles, settings);
  await expect(muxer.addVideoChunk(chunk(0))).rejects.toBe(failure);
  await expect(muxer.addAudioChunk(chunk(0) as unknown as EncodedAudioChunk)).rejects.toBe(failure);
  await expect(muxer.finalize()).rejects.toBe(failure);
  expect(audioAdd).not.toHaveBeenCalled();
  expect(finalize).not.toHaveBeenCalled();
  await muxer.cancel();
  expect(cancel).toHaveBeenCalledOnce();
});

it('cancels startup failures without replacing the original error', async () => {
  const failure = new Error('start failed');
  start.mockRejectedValueOnce(failure);
  cancel.mockRejectedValueOnce(new Error('cleanup failed'));
  await expect(buildMp4Muxer(profiles, settings)).rejects.toBe(failure);
  expect(cancel).toHaveBeenCalledOnce();
});

it('drains cancelled writes, rejects late callbacks and preserves finalize failures', async () => {
  const { muxer } = await buildMp4Muxer(profiles, settings);
  const write = muxer.addVideoChunk(chunk(0));
  const settled = expect(write).rejects.toThrow('CANCELLED');
  const released = muxer.cancel();
  expect(muxer.cancel()).toBe(released);
  await Promise.all([settled, released]);
  expect(videoAdd).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
  expect(() => muxer.addAudioChunk(chunk(0) as unknown as EncodedAudioChunk)).toThrow('closed');
  await expect(muxer.finalize()).rejects.toThrow('CANCELLED');

  const second = await buildMp4Muxer(profiles, settings);
  finalize.mockRejectedValueOnce(new Error('finalize failed'));
  await expect(second.muxer.finalize()).rejects.toThrow('finalize failed');
});

it('rejects audio chunks when no audio track was registered', async () => {
  const { muxer } = await buildMp4Muxer(
    { ...profiles, audioProfile: null, mixedAudio: null },
    settings
  );
  expect(() => muxer.addAudioChunk(chunk(0) as unknown as EncodedAudioChunk)).toThrow('absent');
});
