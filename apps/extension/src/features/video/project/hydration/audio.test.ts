import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  VideoMediaFitMode,
  VideoMotionFocusMode,
  VideoProjectClipType,
  VideoProjectSourceKind,
  VideoTemporalEasing,
} from '../types/index';
import { hydrateVideoProject } from './index';

function createEnvelopeProject() {
  const project = createEmptyVideoProject('Hydration audio');
  const [primaryTrack] = project.tracks;

  project.clips = [
    {
      assetId: 'asset-1',
      duration: 4,
      fadeInMs: 0,
      fadeOutMs: 0,
      fitMode: VideoMediaFitMode.CONTAIN,
      groupId: null,
      id: 'clip-1',
      linkMode: VideoClipLinkMode.DETACHED,
      muted: false,
      name: 'Clip',
      sourceDuration: 4,
      sourceStart: 0,
      startTime: 0,
      trackId: primaryTrack!.id,
      transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      type: VideoProjectClipType.VIDEO,
      volume: 1,
      volumeEnvelopeEnd: -5,
      volumeEnvelopeStart: 9,
    },
  ];
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: 'bad' as never,
      focusPoint: null as never,
      id: 'motion-1',
      motionBlurAmount: Number.POSITIVE_INFINITY,
      scale: 2,
      startTime: 1,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ];

  return project;
}

function createMixedHydrationProject() {
  const project = createEmptyVideoProject('Hydration mixed');
  const [primaryTrack, , overlayTrack] = project.tracks;

  project.source = { kind: VideoProjectSourceKind.RECORDING, recordingId: 'recording-source' };
  project.baseRecordingId = 'recording-base';
  project.cursorTrack = createMixedCursorTrack();
  project.actionEvents = createMixedActionEvents();
  project.motionRegions = createMixedMotionRegions();
  project.assets = [
    {
      createdAt: 1,
      id: 'asset-1',
      metadata: {
        audioPeaks: [1.5, -1, 'bad' as never],
        duration: 3,
        hasAudio: true,
        height: 720,
        mimeType: 'video/mp4',
        size: 100,
        width: 1280,
      },
      name: 'Asset',
      source: { kind: 'project-asset', projectAssetId: 'asset-1' },
      type: 'VIDEO',
    },
  ];
  project.clips = createMixedClips(primaryTrack!.id, overlayTrack!.id) as never;
  project.transitions = undefined as never;

  return project;
}

function createMixedCursorTrack() {
  return {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [
      { id: 'sample-1', interpolation: 'bad' as never, time: 1, visible: true, x: 20, y: 40 },
      { id: 'sample-2', time: 2, visible: 'bad' as never, x: 0, y: 0 },
    ],
    skin: {
      animationPreset: VideoCursorAnimationPreset.NONE,
      color: '#fff',
      hidden: 0 as never,
      preset: VideoCursorVisualPreset.ARROW,
      scale: 'bad' as never,
      shadow: 0 as never,
    },
  };
}

function createMixedActionEvents() {
  return [
    {
      data: null as never,
      duration: -1,
      id: 'action-1',
      kind: 'CLICK' as never,
      label: 1 as never,
      point: { x: 10, y: 20 },
      preset: 'CLICK_RIPPLE' as never,
      time: 2,
    },
    {
      data: {},
      duration: 1,
      id: 1 as never,
      kind: 'CLICK' as never,
      label: 'skip',
      point: null,
      preset: 'NONE' as never,
      time: Number.NaN,
    },
  ];
}

function createMixedMotionRegions() {
  return [
    {
      duration: 1,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 100, y: 80 },
      id: 'motion-1',
      motionBlurAmount: 0.25,
      scale: 1.2,
      startTime: 0.5,
      targetActionEventId: null,
      zoomInDuration: 0.1,
      zoomOutDuration: 0.1,
    },
    {
      duration: 1,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 100, y: 80 },
      id: 2 as never,
      motionBlurAmount: 0.25,
      scale: 1.2,
      startTime: 0.5,
      targetActionEventId: null,
      zoomInDuration: 0.1,
      zoomOutDuration: 0.1,
    },
  ];
}

function createMixedClips(primaryTrackId: string, overlayTrackId: string) {
  return [
    {
      assetId: 'asset-1',
      duration: 3,
      fadeInMs: undefined as never,
      fadeOutMs: undefined as never,
      fitMode: undefined as never,
      groupId: 'group-1',
      id: 'clip-1',
      linkMode: undefined as never,
      muted: false,
      name: 'Video',
      sourceDuration: 3,
      sourceStart: 0,
      startTime: 0,
      trackId: primaryTrackId,
      transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
      transitionIn: undefined as never,
      transitionOut: undefined as never,
      type: VideoProjectClipType.VIDEO,
      volume: undefined as never,
    },
    {
      duration: 2,
      fadeInMs: undefined as never,
      fadeOutMs: undefined as never,
      groupId: null,
      id: 'clip-2',
      linkMode: undefined as never,
      muted: true,
      name: 'Text',
      startTime: 1,
      style: {},
      text: 'Hello',
      trackId: overlayTrackId,
      transform: { height: 60, opacity: 1, rotation: 0, width: 120, x: 5, y: 5 },
      transitionIn: undefined as never,
      transitionOut: undefined as never,
      type: VideoProjectClipType.TEXT,
      volume: undefined as never,
    },
  ];
}

it('normalizes audio envelope ranges and motion blur payloads during hydration', () => {
  const hydrated = hydrateVideoProject(createEnvelopeProject());

  expect(hydrated.clips[0]).toEqual(
    expect.objectContaining({
      volumeEnvelopeEnd: 0,
      volumeEnvelopeStart: 2,
    })
  );
  expect(hydrated.motionRegions).toEqual([
    expect.objectContaining({
      focusMode: VideoMotionFocusMode.MANUAL,
      motionBlurAmount: 0,
    }),
  ]);
});

it('normalizes recording-source, cursor, action, clip, and asset branches together', () => {
  const hydrated = hydrateVideoProject(createMixedHydrationProject());

  expect(hydrated.source).toEqual({
    kind: VideoProjectSourceKind.RECORDING,
    recordingId: 'recording-source',
  });
  expect(hydrated.baseRecordingId).toBe('recording-source');
  expect(hydrated.assets[0]?.metadata.audioPeaks).toEqual([1, 0, 0]);
  expect(hydrated.cursorTrack).toEqual(
    expect.objectContaining({
      captureMode: VideoCursorCaptureMode.SEPARATE,
      samples: [
        {
          id: 'sample-1',
          interpolation: VideoTemporalEasing.LINEAR,
          skinOverride: null,
          time: 1,
          visible: true,
          x: 20,
          y: 40,
        },
      ],
      skin: {
        animationPreset: 'NONE',
        color: '#fff',
        hidden: false,
        preset: 'ARROW',
        scale: 1,
        shadow: false,
      },
    })
  );
  expect(hydrated.actionEvents).toEqual([
    expect.objectContaining({ data: {}, duration: 0, label: '', point: { x: 10, y: 20 } }),
  ]);
  expect(hydrated.motionRegions).toHaveLength(1);
  expect(hydrated.transitions).toEqual([]);
  expect(hydrated.clips[0]).toEqual(
    expect.objectContaining({
      fitMode: VideoMediaFitMode.CONTAIN,
      linkMode: VideoClipLinkMode.LINKED,
      volume: 1,
    })
  );
  expect(hydrated.clips[1]).toEqual(
    expect.objectContaining({ linkMode: VideoClipLinkMode.DETACHED, volume: 1 })
  );
});
