import { expect, it } from 'vitest';

import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
  createFittedTransform,
  resolveMediaClipTransformForFitMode,
} from './clip';
import {
  VideoClipLinkMode,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  type VideoProjectAsset,
  VideoProjectAssetType,
  VideoProjectClipType,
} from '../types/index';

function createVideoAsset(): VideoProjectAsset {
  return {
    createdAt: 1,
    id: 'asset-video',
    metadata: {
      audioPeaks: null,
      duration: 5,
      hasAudio: true,
      height: 720,
      mimeType: 'video/mp4',
      size: 1024,
      width: 1280,
    },
    name: 'Demo video',
    source: { kind: 'project-asset', projectAssetId: 'project-asset-video' },
    type: VideoProjectAssetType.VIDEO,
  };
}

function createAudioAsset(): VideoProjectAsset {
  return {
    createdAt: 2,
    id: 'asset-audio',
    metadata: {
      audioPeaks: [0.1, 0.2],
      duration: 3,
      hasAudio: true,
      height: 0,
      mimeType: 'audio/mp3',
      size: 512,
      width: 0,
    },
    name: 'Demo audio',
    source: { kind: 'project-asset', projectAssetId: 'project-asset-audio' },
    type: VideoProjectAssetType.AUDIO,
  };
}

it('creates linked video clips with shared base playback fields', () => {
  const clip = createVideoClipFromAsset('track-1', createVideoAsset(), 1280, 720, 4, {
    groupId: 'group-1',
    muted: true,
  });

  expect(clip).toMatchObject({
    assetId: 'asset-video',
    audioGainEnd: 1,
    audioGainStart: 1,
    duration: 5,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: 100,
    groupId: 'group-1',
    linkMode: VideoClipLinkMode.LINKED,
    muted: true,
    playbackRate: 1,
    shadowIntensity: 0,
    shadowMode: VideoMediaShadowMode.BACKDROP,
    sourceDuration: 5,
    sourceStart: 0,
    startTime: 4,
    trackId: 'track-1',
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  });
});

it('creates detached audio clips with the narrow audio transform seam', () => {
  const clip = createAudioClipFromAsset('track-audio', createAudioAsset(), 2);

  expect(clip).toMatchObject({
    assetId: 'asset-audio',
    audioGainEnd: 1,
    audioGainStart: 1,
    duration: 3,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    playbackRate: 1,
    sourceDuration: 3,
    sourceStart: 0,
    startTime: 2,
    trackId: 'track-audio',
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
    transform: {
      height: 0,
      opacity: 1,
      rotation: 0,
      width: 0,
      x: 0,
      y: 0,
    },
    type: VideoProjectClipType.AUDIO,
    volume: 1,
  });
});

it('creates image clips and zero-safe fitted transforms for asset-backed visuals', () => {
  const videoAsset = createVideoAsset();
  const clip = createVideoClipFromAsset(
    'track-image',
    {
      ...videoAsset,
      id: 'asset-image',
      metadata: {
        ...videoAsset.metadata,
        duration: null,
      },
      type: VideoProjectAssetType.IMAGE,
    },
    1920,
    1080,
    3
  );

  expect(clip).toMatchObject({
    assetId: 'asset-image',
    duration: 5,
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: 100,
    shadowIntensity: 0,
    shadowMode: VideoMediaShadowMode.BACKDROP,
    startTime: 3,
    type: VideoProjectClipType.IMAGE,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
  });
  expect(createFittedTransform(0, 0, 1920, 1080)).toEqual({
    height: 1080,
    opacity: 1,
    rotation: 0,
    width: 1920,
    x: 0,
    y: 0,
  });
});

it('resolves all shared fit modes into canvas transforms', () => {
  expect(
    resolveMediaClipTransformForFitMode(200, 100, 400, 400, VideoMediaFitMode.SOURCE_100)
  ).toMatchObject({ height: 100, width: 200, x: 100, y: 150 });
  expect(
    resolveMediaClipTransformForFitMode(200, 100, 400, 400, VideoMediaFitMode.FIT_LONG_SIDE)
  ).toMatchObject({ height: 200, width: 400, x: 0, y: 100 });
  expect(
    resolveMediaClipTransformForFitMode(200, 100, 400, 400, VideoMediaFitMode.FIT_SHORT_SIDE)
  ).toMatchObject({ height: 400, width: 800, x: -200, y: 0 });
  expect(
    resolveMediaClipTransformForFitMode(200, 100, 400, 400, VideoMediaFitMode.STRETCH)
  ).toMatchObject({ height: 400, width: 400, x: 0, y: 0 });
  expect(
    resolveMediaClipTransformForFitMode(200, 100, 400, 400, VideoMediaFitMode.CONTAIN, 50)
  ).toMatchObject({ height: 100, width: 200, x: 100, y: 150 });
  expect(
    resolveMediaClipTransformForFitMode(200, 100, 400, 400, VideoMediaFitMode.STRETCH, 50)
  ).toMatchObject({ height: 200, width: 200, x: 100, y: 100 });
  expect(resolveMediaClipTransformForFitMode(0, 0, 400, 400, VideoMediaFitMode.CONTAIN)).toEqual({
    height: 400,
    opacity: 1,
    rotation: 0,
    width: 400,
    x: 0,
    y: 0,
  });
});
