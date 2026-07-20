import { beforeEach, expect, it, vi } from 'vitest';

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
  return {
    assets: [
      { id: 'asset-1', metadata: { mimeType: 'video/webm' } },
      { id: 'asset-2', metadata: { mimeType: 'video/webm' } },
    ],
    clips: [
      {
        assetId: 'asset-1',
        duration: 1,
        id: 'clip-1',
        sourceStart: 0,
        startTime: 0,
        trackId: 'track-1',
        type: 'VIDEO',
      },
      {
        assetId: 'asset-2',
        duration: 1,
        id: 'clip-2',
        sourceStart: 4,
        startTime: 0,
        trackId: 'track-1',
        type: 'VIDEO',
      },
    ],
    tracks: [{ id: 'track-1', visible: true }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  inputDisposeMocks.length = 0;
  getPrimaryVideoTrackMock.mockResolvedValue({ canDecode: canDecodeMock });
  canDecodeMock.mockResolvedValue(true);
  loadBlobForAssetMock.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));
});

it('creates sequential WebM frame providers and releases prepared samples', async () => {
  const sample = createSample();
  samplesAtTimestampsMock.mockReturnValue(createSamples([sample]));
  const project = { ...createProject(), clips: [createProject().clips[0]!] };

  const providers = await createWebmFrameProviders(project as never, [0, 0.5, 1.5]);

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

  await expect(createWebmFrameProviders(createProject() as never, [0])).resolves.toBeNull();

  expect(inputDisposeMocks).toHaveLength(2);
  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
  expect(inputDisposeMocks[1]).toHaveBeenCalledOnce();
});

it('disposes the input and falls back when a WebM source has no video track', async () => {
  getPrimaryVideoTrackMock.mockResolvedValueOnce(null);

  await expect(createWebmFrameProviders(createProject() as never, [0])).rejects.toThrow(
    'no video track'
  );

  expect(inputDisposeMocks[0]).toHaveBeenCalledOnce();
});

it('returns unavailable when no visible WebM clip needs decoded frames', async () => {
  const project = {
    ...createProject(),
    clips: [{ ...createProject().clips[0]!, startTime: 2 }],
  };

  await expect(createWebmFrameProviders(project as never, [0])).resolves.toBeNull();

  expect(loadBlobForAssetMock).not.toHaveBeenCalled();
});

it('returns unavailable when an active clip source asset is missing', async () => {
  const project = { ...createProject(), assets: [] };

  await expect(createWebmFrameProviders(project as never, [0])).resolves.toBeNull();

  expect(loadBlobForAssetMock).not.toHaveBeenCalled();
});
