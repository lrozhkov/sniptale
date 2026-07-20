import { expect, it, vi } from 'vitest';

const { getAssetByIdMock, getProjectAssetMock, getRecordingMock } = vi.hoisted(() => ({
  getAssetByIdMock: vi.fn(),
  getProjectAssetMock: vi.fn(),
  getRecordingMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/projects/index')>()),

  getProjectAsset: getProjectAssetMock,
}));

vi.mock('../../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/recordings/index')
  >()),

  getRecording: getRecordingMock,
}));

vi.mock('../../../../features/video/project/timeline/basics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/project/timeline/basics')>()),

  getAssetById: getAssetByIdMock,
}));

import { decodeClipAudioBuffer } from './decode';
import { createAudioClipFromAsset } from '../../../../features/video/project/factories/clip';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoProjectAssetType,
  type VideoProjectAsset,
} from '../../../../features/video/project/types';
import type { EffectRuntimeAudioPlan } from '../../../../features/video/composition/effect-runtime/audio/plan';
import { createEffectAudioBufferCache } from '../../../../features/video/composition/effect-runtime/audio/buffer-cache';
import { createWavBytes } from '../../../../features/video/composition/effect-runtime/media/test-support';

function createProject() {
  const project = createEmptyVideoProject();
  const clip = createAudioClipFromAsset('track-1', createAsset());
  project.clips = [clip];
  return { clip, project };
}

function createAsset(): VideoProjectAsset {
  return {
    createdAt: 1,
    id: 'asset-1',
    metadata: {
      audioPeaks: null,
      duration: 1,
      hasAudio: true,
      height: 0,
      mimeType: 'audio/wav',
      size: 5,
      width: 0,
    },
    name: 'Audio',
    source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    type: VideoProjectAssetType.AUDIO,
  };
}

function createDecodedAudio(id = 'decoded') {
  return { id, length: 48_000, numberOfChannels: 2, sampleRate: 48_000 };
}

it('decodes clip audio once per asset and reuses the cached buffer', async () => {
  const decodeAudioData = vi.fn(async () => createDecodedAudio());
  const decodeContext = { decodeAudioData };
  const decodedBuffers = createEffectAudioBufferCache<ReturnType<typeof createDecodedAudio>>();
  const { clip, project } = createProject();

  getAssetByIdMock.mockReturnValue({
    metadata: { hasAudio: true },
    source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
  });
  getProjectAssetMock.mockResolvedValue({ blob: new Blob(['audio']) });

  const first = await decodeClipAudioBuffer(project, clip, decodedBuffers, decodeContext);
  const second = await decodeClipAudioBuffer(project, clip, decodedBuffers, decodeContext);

  expect(first).toBe(second);
  expect(getProjectAssetMock).toHaveBeenCalledOnce();
  expect(decodeAudioData).toHaveBeenCalledOnce();
});

it('loads recording blobs when decoding recording-backed clips', async () => {
  const decodeContext = { decodeAudioData: vi.fn(async () => createDecodedAudio()) };
  const decodedBuffers = createEffectAudioBufferCache<ReturnType<typeof createDecodedAudio>>();
  const { clip, project } = createProject();

  getAssetByIdMock.mockReturnValue({
    metadata: { hasAudio: true },
    source: { kind: 'recording', recordingId: 'recording-1' },
  });
  getRecordingMock.mockResolvedValue({ blob: new Blob(['recording']) });

  await decodeClipAudioBuffer(project, clip, decodedBuffers, decodeContext);

  expect(getRecordingMock).toHaveBeenCalledOnce();
});

it('bounds decoded EffectV1 PCM and caches it by retained snapshot identity', async () => {
  const decodeContext = { decodeAudioData: vi.fn(async () => createDecodedAudio('effect')) };
  const decodedBuffers = createEffectAudioBufferCache<ReturnType<typeof createDecodedAudio>>();
  const { project } = createProject();
  const effectClip: EffectRuntimeAudioPlan = {
    assetBlob: new Blob([createWavBytes().buffer as ArrayBuffer], { type: 'audio/wav' }),
    assetCacheKey: 'snapshot:tone:sha',
    assetMimeType: 'audio/wav',
    audioGainEnd: 1,
    audioGainStart: 1,
    duration: 1,
    effectInstanceId: 'effect-1',
    fadeInMs: 0,
    fadeOutMs: 0,
    id: 'effect-1:audio:0',
    muted: false,
    playbackRate: 1,
    snapshotId: 'snapshot-1',
    sourceDuration: 1,
    sourceKind: 'effect-snapshot',
    sourceStart: 0,
    startTime: 0,
    volume: 1,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  };

  const first = await decodeClipAudioBuffer(project, effectClip, decodedBuffers, decodeContext);
  const second = await decodeClipAudioBuffer(project, effectClip, decodedBuffers, decodeContext);

  expect(first).toBe(second);
  expect(decodedBuffers.get('snapshot:tone:sha')).toBe(first);
});
