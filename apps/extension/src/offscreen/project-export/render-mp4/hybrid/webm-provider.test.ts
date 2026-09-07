import { beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import { VideoProjectAssetType, VideoTrackKind } from '../../../../features/video/project/types';

const getDecoderConfigMock = vi.hoisted(() => vi.fn());
const canDecodeMock = vi.hoisted(() => vi.fn());
const getPrimaryVideoTrackMock = vi.hoisted(() => vi.fn());
const loadBlobForAssetMock = vi.hoisted(() => vi.fn());
const samplesAtTimestampsMock = vi.hoisted(() => vi.fn());

const inputDisposeMocks: ReturnType<typeof vi.fn>[] = [];

vi.mock('mediabunny', () => ({
  BlobSource: class {
    constructor(public blob: Blob) {}
  },
  Input: class {
    dispose = vi.fn();

    constructor() {
      inputDisposeMocks.push(this.dispose);
    }

    getPrimaryVideoTrack = getPrimaryVideoTrackMock;
  },
  VideoSampleSink: class {
    samplesAtTimestamps = samplesAtTimestampsMock;
  },
  WEBM: {},
}));

vi.mock('../../media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media')>()),
  loadBlobForAsset: loadBlobForAssetMock,
}));

import { createWebmFrameProviders, prepareWebmProviderFrames } from './webm-provider';

function createSample() {
  return {
    close: vi.fn(),
    displayHeight: 720,
    displayWidth: 1280,
    draw: vi.fn(),
  };
}

async function* createSamples(samples: unknown[]) {
  for (const sample of samples) {
    yield sample;
  }
}

function createProject() {
  const project = createEmptyVideoProject('WebM provider');
  const track = { ...createVideoProjectTrack('Video', 0, VideoTrackKind.PRIMARY), id: 'track-1' };
  const assets = [1, 2].map((index) => ({
    ...createVideoProjectAsset(
      `Source ${index}`,
      VideoProjectAssetType.VIDEO,
      { kind: 'project-asset', projectAssetId: `asset-${index}` },
      {
        width: 1280,
        height: 720,
        duration: 5,
        mimeType: 'video/webm',
        size: 3,
        hasAudio: false,
        audioPeaks: null,
      }
    ),
    id: `asset-${index}`,
  }));
  return {
    ...project,
    assets,
    tracks: [track],
    clips: assets.map((asset, index) => ({
      ...createVideoClipFromAsset(track.id, asset, 1280, 720),
      id: `clip-${index + 1}`,
      duration: 1,
      sourceStart: index * 4,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  inputDisposeMocks.length = 0;
  getPrimaryVideoTrackMock.mockResolvedValue({
    canDecode: canDecodeMock,
    getDecoderConfig: getDecoderConfigMock,
  });
  getDecoderConfigMock.mockResolvedValue({
    codec: 'vp8',
    codedWidth: 1280,
    codedHeight: 720,
    colorSpace: { matrix: 'smpte170m' },
  });
  canDecodeMock.mockResolvedValue(true);
  loadBlobForAssetMock.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));
});

it('creates sequential WebM frame providers and releases prepared samples', async () => {
  const sample = createSample();
  samplesAtTimestampsMock.mockReturnValue(createSamples([sample]));
  const project = { ...createProject(), clips: [createProject().clips[0]!] };

  const providers = await createWebmFrameProviders(project, [0, 0.5, 1.5]);

  expect(providers).toHaveLength(1);
  expect(samplesAtTimestampsMock).toHaveBeenCalledWith([0, 0.5]);
  const frames = await prepareWebmProviderFrames(providers!, 0);
  expect(frames).toHaveLength(1);
  frames[0]!.source.draw({} as CanvasRenderingContext2D, 1, 2, 3, 4);
  expect(sample.draw).toHaveBeenCalledWith({}, 1, 2, 3, 4);
  frames[0]!.release();
  expect(sample.close).toHaveBeenCalledOnce();
  providers![0]!.dispose();
  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
});

it('disposes initialized providers when a later WebM decoder is unavailable', async () => {
  canDecodeMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

  await expect(createWebmFrameProviders(createProject(), [0])).resolves.toBeNull();

  expect(inputDisposeMocks).toHaveLength(2);
  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
  expect(inputDisposeMocks[1]).toHaveBeenCalledOnce();
});

it('disposes the input and falls back when a WebM source has no video track', async () => {
  getPrimaryVideoTrackMock.mockResolvedValueOnce(null);

  await expect(createWebmFrameProviders(createProject(), [0])).rejects.toThrow('no video track');

  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
});

it('returns unavailable when no visible WebM clip needs decoded frames', async () => {
  const project = {
    ...createProject(),
    clips: [{ ...createProject().clips[0]!, startTime: 2 }],
  };

  await expect(createWebmFrameProviders(project, [0])).resolves.toBeNull();

  expect(loadBlobForAssetMock).not.toHaveBeenCalled();
});

it('returns unavailable when an active clip source asset is missing', async () => {
  const project = { ...createProject(), assets: [] };

  await expect(createWebmFrameProviders(project, [0])).resolves.toBeNull();

  expect(loadBlobForAssetMock).not.toHaveBeenCalled();
});

it.each([undefined, { primaries: 'bt709' }])(
  'falls back for VP8 without an explicit matrix (%j)',
  async (colorSpace) => {
    getDecoderConfigMock.mockResolvedValueOnce({
      codec: 'vp8',
      codedWidth: 1280,
      codedHeight: 720,
      colorSpace,
    });
    await expect(createWebmFrameProviders(createProject(), [0])).resolves.toBeNull();
    expect(samplesAtTimestampsMock).not.toHaveBeenCalled();
    expect(inputDisposeMocks).toHaveLength(1);
    expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
  }
);

it('disposes earlier providers when a later VP8 source requires color fallback', async () => {
  getDecoderConfigMock
    .mockResolvedValueOnce({ codec: 'vp8', colorSpace: { matrix: 'smpte170m' } })
    .mockResolvedValueOnce({ codec: 'vp8' });
  await expect(createWebmFrameProviders(createProject(), [0])).resolves.toBeNull();
  expect(inputDisposeMocks).toHaveLength(2);
  for (const dispose of inputDisposeMocks) expect(dispose).toHaveBeenCalledOnce();
});

it('retains acceleration for VP9 without container color metadata', async () => {
  getDecoderConfigMock.mockResolvedValue({ codec: 'vp09.00.10.08' });
  const providers = await createWebmFrameProviders(createProject(), [0]);
  expect(providers).toHaveLength(2);
  providers?.forEach((provider) => provider.dispose());
});

it('releases the input when decoder metadata cannot be read', async () => {
  getDecoderConfigMock.mockRejectedValueOnce(new Error('Invalid color metadata'));
  await expect(createWebmFrameProviders(createProject(), [0])).rejects.toThrow(
    'Invalid color metadata'
  );
  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
});
