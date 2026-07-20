import { expect, it } from 'vitest';
import {
  VideoMediaFitMode,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types/index';
import type { VideoProjectAsset } from '../../../../features/video/project/types';
import {
  CURSOR_DETECTION_TARGET_FPS,
  createCursorDetectionSamplingPlan,
  mapCursorProjectAnchorToSource,
  mapCursorSourceSampleToProject,
  mergeVisualCursorTrackRange,
} from './analysis';

it('creates bounded sampling plans in project time and source time', () => {
  const clip = createVideoClip({ playbackRate: 2, sourceStart: 5, startTime: 10, duration: 4 });

  const samples = createCursorDetectionSamplingPlan({
    clip,
    maxFrames: 3,
    range: { start: 11, end: 13 },
    targetFps: 10,
  });

  expect(samples).toEqual([
    { projectTime: 11, sourceTime: 7 },
    { projectTime: 12, sourceTime: 9 },
    { projectTime: 13, sourceTime: 11 },
  ]);
});

it('defaults to coarse one-second sampling for camera cursor detection', () => {
  const clip = createVideoClip({ duration: 4 });

  const samples = createCursorDetectionSamplingPlan({ clip });

  expect(CURSOR_DETECTION_TARGET_FPS).toBe(1);
  expect(samples).toHaveLength(5);
  expect(samples.map((sample) => sample.projectTime)).toEqual([0, 1, 2, 3, 4]);
});

it('maps cursor samples and manual anchors between source pixels and project coordinates', () => {
  const asset = createVideoAsset(100, 50);
  const clip = createVideoClip({
    fitMode: VideoMediaFitMode.CONTAIN,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 10, y: 20 },
  });

  expect(
    mapCursorSourceSampleToProject({
      asset,
      clip,
      sample: { confidence: 1, height: 10, time: 1, visible: true, width: 10, x: 50, y: 25 },
    })
  ).toEqual(
    expect.objectContaining({
      height: 10,
      time: 1,
      width: 10,
      x: 60,
      y: 70,
    })
  );
  expect(
    mapCursorProjectAnchorToSource({
      anchor: { confidence: 1, height: 10, id: 'anchor', time: 1, width: 10, x: 60, y: 70 },
      asset,
      clip,
    })
  ).toEqual(expect.objectContaining({ height: 10, time: 1, width: 10, x: 50, y: 25 }));
});

it('merges rerun samples only inside the selected project range', () => {
  const track = mergeVisualCursorTrackRange({
    detectedTrack: {
      id: 'visual-cursor',
      kind: 'visualCursor',
      samples: [{ confidence: 0.9, time: 2, visible: true, x: 200, y: 200 }],
      source: 'visualDetection',
    },
    existingTrack: {
      correctionAnchors: [{ id: 'anchor', time: 2, x: 20, y: 20 }],
      id: 'visual-cursor',
      kind: 'visualCursor',
      samples: [
        { confidence: 0.7, time: 0, visible: true, x: 0, y: 0 },
        { confidence: 0.7, time: 2, visible: true, x: 20, y: 20 },
        { confidence: 0.7, time: 5, visible: true, x: 50, y: 50 },
      ],
      source: 'visualDetection',
    },
    projectEndTime: 3,
    projectStartTime: 1,
  });

  expect(track.samples).toEqual([
    expect.objectContaining({ time: 0, x: 0 }),
    expect.objectContaining({ time: 2, x: 200 }),
    expect.objectContaining({ time: 5, x: 50 }),
  ]);
  expect(track.correctionAnchors).toEqual([expect.objectContaining({ id: 'anchor' })]);
});

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.STRETCH,
    groupId: null,
    id: 'clip-1',
    linkMode: 'DETACHED',
    muted: true,
    name: 'Video',
    playbackRate: 1,
    sourceDuration: 4,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-1',
    transform: { height: 50, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    type: 'VIDEO',
    volume: 1,
    ...overrides,
  };
}

function createVideoAsset(width: number, height: number): VideoProjectAsset {
  return {
    createdAt: 0,
    id: 'asset-1',
    metadata: {
      audioPeaks: null,
      duration: 4,
      hasAudio: false,
      height,
      mimeType: 'video/mp4',
      size: 100,
      width,
    },
    name: 'Video',
    source: { kind: 'project-asset', projectAssetId: 'asset-1' },
    type: 'VIDEO',
  };
}
