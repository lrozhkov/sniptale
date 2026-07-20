import { describe, expect, it } from 'vitest';

import { VideoProjectAssetType, VideoProjectClipType } from '../types/index';
import {
  createRecordingAudioClip,
  createRecordingBaseClip,
  createRecordingProjectAsset,
} from './recording';

function createSilentRecordingAsset() {
  return createRecordingProjectAsset({
    duration: 0,
    filename: 'demo.webm',
    height: 720,
    mimeType: 'video/webm',
    recordingId: 'recording-1',
    size: 1024,
    width: 1280,
  });
}

function createAudioRecordingAsset() {
  return createRecordingProjectAsset({
    audioPeaks: [0.2, 0.8],
    duration: 2.5,
    filename: 'demo-with-audio.webm',
    hasAudio: true,
    height: 1080,
    mimeType: 'video/webm',
    recordingId: 'recording-2',
    size: 2048,
    width: 1920,
  });
}

function expectSilentRecordingShape(asset: ReturnType<typeof createSilentRecordingAsset>) {
  const clip = createRecordingBaseClip(
    asset,
    { duration: 0.01, height: 720, width: 1280 },
    'track-1',
    null
  );

  expect(asset).toEqual(
    expect.objectContaining({
      name: 'demo.webm',
      type: VideoProjectAssetType.RECORDING,
    })
  );
  expect(asset.metadata).toEqual(expect.objectContaining({ audioPeaks: null, hasAudio: false }));
  expect(clip).toEqual(
    expect.objectContaining({
      duration: 0.1,
      groupId: null,
      muted: false,
      playbackRate: 1,
      sourceDuration: 0.1,
      type: VideoProjectClipType.VIDEO,
    })
  );
}

function expectLinkedAudioRecordingShape(asset: ReturnType<typeof createAudioRecordingAsset>) {
  const baseClip = createRecordingBaseClip(
    asset,
    { duration: 2.5, height: 1080, width: 1920 },
    'track-video',
    'group-1'
  );
  const audioClip = createRecordingAudioClip(asset, 'track-audio', 2.5, 'group-1');

  expect(asset.metadata).toEqual(
    expect.objectContaining({
      audioPeaks: [0.2, 0.8],
      hasAudio: true,
    })
  );
  expect(baseClip).toEqual(expect.objectContaining({ groupId: 'group-1', muted: true }));
  expect(audioClip).toEqual(
    expect.objectContaining({
      duration: 2.5,
      groupId: 'group-1',
      muted: false,
      playbackRate: 1,
      sourceDuration: 2.5,
      type: VideoProjectClipType.AUDIO,
    })
  );
}

describe('recording project factories', () => {
  it('defaults recording assets to silent metadata and clamps tiny base clips', () => {
    expectSilentRecordingShape(createSilentRecordingAsset());
  });

  it('preserves linked audio recording state when the asset carries audio', () => {
    expectLinkedAudioRecordingShape(createAudioRecordingAsset());
  });
});
