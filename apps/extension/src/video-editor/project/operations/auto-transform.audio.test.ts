import { expect, it, vi, beforeEach } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
const { samples, dispose, close, getTracks } = vi.hoisted(() => ({
  samples: vi.fn(),
  dispose: vi.fn(),
  close: vi.fn(),
  getTracks: vi.fn(),
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    getAudioTracks = getTracks;
    dispose = dispose;
  },
  AudioSampleSink: class {
    samples = samples;
  },
}));
vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),
  getRecording: async () => ({ file: new Blob(['audio']) }),
}));
vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  getProjectAsset: vi.fn(async () => ({ status: 'ready', entry: { file: new Blob(['audio']) } })),
}));
import { analyzeAutoProcessingAudio, isSilentPcm } from './auto-transform.audio';
const asset = () => createProject([createVideoClip()]).assets[0]!;
beforeEach(() => {
  vi.clearAllMocks();
  getTracks.mockResolvedValue([{ canDecode: async () => true }]);
});
it('protects speech, transients, and nonfinite PCM from being called silence', () => {
  expect(isSilentPcm(new Float32Array(100).fill(0.001))).toBe(true);
  expect(isSilentPcm(new Float32Array(100).fill(0.01))).toBe(false);
  const transient = new Float32Array(100);
  transient[40] = 0.1;
  expect(isSilentPcm(transient)).toBe(false);
  expect(isSilentPcm(new Float32Array([NaN]))).toBe(false);
});
it('keeps only decoded silent intervals and releases samples and input', async () => {
  samples.mockImplementation(async function* () {
    for (const [time, value] of [
      [0, 0],
      [1, 0.2],
      [3, 0],
    ] as const)
      yield {
        timestamp: time,
        numberOfChannels: 2,
        numberOfFrames: 100,
        sampleRate: 100,
        copyTo: (pcm: Float32Array) => pcm.fill(value),
        close,
      };
  });
  const result = await analyzeAutoProcessingAudio(asset());
  expect(result).toEqual({
    status: 'analyzed',
    ranges: [
      { startTime: 0, endTime: 1 },
      { startTime: 3, endTime: 4 },
    ],
  });
  expect(close).toHaveBeenCalledTimes(3);
  expect(dispose).toHaveBeenCalledOnce();
});
it('does not fall back to no-audio when decoding fails', async () => {
  samples.mockImplementation(async function* () {
    throw new Error('decode failed');
    yield;
  });
  expect(await analyzeAutoProcessingAudio(asset())).toEqual({ status: 'unavailable' });
  expect(dispose).toHaveBeenCalledOnce();
});
it('uses mouse-only detection only for a source confirmed without audio', async () => {
  getTracks.mockResolvedValue([]);
  expect(await analyzeAutoProcessingAudio(asset())).toEqual({ status: 'absent' });
});

it('analyzes imported library project assets and intersects all audio tracks', async () => {
  const imported = {
    ...asset(),
    source: { kind: 'project-asset' as const, projectAssetId: 'local' },
  };
  getTracks.mockResolvedValue([{ canDecode: async () => true }, { canDecode: async () => true }]);
  samples.mockImplementation(async function* () {
    yield {
      timestamp: 0,
      numberOfChannels: 1,
      numberOfFrames: 100,
      sampleRate: 100,
      copyTo: (pcm: Float32Array) => pcm.fill(0),
      close,
    };
  });
  expect(await analyzeAutoProcessingAudio(imported)).toEqual({
    status: 'analyzed',
    ranges: [{ startTime: 0, endTime: 1 }],
  });
});
it('does not try decoding confirmed silent sources, and reports unsupported audio', async () => {
  const silent = { ...asset(), metadata: { ...asset().metadata, hasAudio: false } };
  expect(await analyzeAutoProcessingAudio(silent)).toEqual({ status: 'absent' });
  expect(getTracks).not.toHaveBeenCalled();
  getTracks.mockResolvedValue([{ canDecode: async () => false }]);
  expect(await analyzeAutoProcessingAudio(asset())).toEqual({ status: 'unavailable' });
});
it('does not confuse an inaccessible source with an audio-free source', async () => {
  const inaccessible = {
    ...asset(),
    source: { kind: 'scenario-asset' as const, scenarioAssetId: 'other' },
  };
  expect(await analyzeAutoProcessingAudio(inaccessible)).toEqual({ status: 'unavailable' });
});
