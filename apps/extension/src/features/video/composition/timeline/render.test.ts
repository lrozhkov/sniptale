import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectTrack } from '../../project/factories/creation';
import { createSubtitleClip } from '../../project/factories/overlay-clip';
import {
  VideoMotionFocusMode,
  VideoTemporalEasing,
  VideoTrackKind,
} from '../../project/types/index';
import { resolveVideoCompositionRenderPasses } from './render';

it('returns a single visual pass when no motion blur is active', () => {
  const project = createEmptyVideoProject('Render passes', 1280, 720);
  const result = resolveVideoCompositionRenderPasses(project, 1);

  expect(result.visualPasses).toHaveLength(1);
  expect(result.visualPasses[0]).toEqual(
    expect.objectContaining({
      alpha: 1,
      frame: result.overlayFrame,
      time: 1,
    })
  );
});

it('builds multiple alpha-normalized visual passes for blurred camera motion', () => {
  const project = createEmptyVideoProject('Motion blur', 1280, 720);
  project.duration = 8;
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 900, y: 300 },
      id: 'motion-1',
      motionBlurAmount: 0.75,
      scale: 2,
      startTime: 1,
      targetActionEventId: null,
      zoomInDuration: 1,
      zoomOutDuration: 0.25,
    },
  ];

  const result = resolveVideoCompositionRenderPasses(project, 1.5);

  expect(result.visualPasses.length).toBeGreaterThan(1);
  expect(result.visualPasses.reduce((sum, pass) => sum + pass.alpha, 0)).toBeCloseTo(1);
  expect(result.visualPasses.some((pass) => pass.time === 1.5)).toBe(true);
  expect(
    new Set(
      result.visualPasses.map((pass) => `${pass.frame.camera.viewportX}:${pass.frame.camera.scale}`)
    ).size
  ).toBeGreaterThan(1);
  const centerPass = result.visualPasses.find((pass) => pass.time === 1.5);
  expect(centerPass?.alpha ?? 0).toBeGreaterThan(result.visualPasses[0]?.alpha ?? 0);
});

it('falls back to a single pass when blur sampling produces no meaningful camera spread', () => {
  const project = createEmptyVideoProject('Static blur', 1280, 720);
  project.duration = 8;
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 640, y: 360 },
      id: 'motion-1',
      motionBlurAmount: 0.75,
      scale: 1,
      startTime: 1,
      targetActionEventId: null,
      zoomInDuration: 0,
      zoomOutDuration: 0,
    },
  ];

  const result = resolveVideoCompositionRenderPasses(project, 1.5);

  expect(result.visualPasses).toHaveLength(1);
  expect(result.visualPasses[0]).toEqual(
    expect.objectContaining({
      alpha: 1,
      frame: result.overlayFrame,
    })
  );
});

it('forwards subtitle visibility options into the resolved render passes', () => {
  const project = createEmptyVideoProject('Subtitle render', 1280, 720);
  const subtitleTrack = createVideoProjectTrack('Subtitles', 3, VideoTrackKind.SUBTITLE);

  project.tracks.push(subtitleTrack);
  project.clips.push(createSubtitleClip(subtitleTrack.id, 1280, 720, 0));

  expect(
    resolveVideoCompositionRenderPasses(project, 1, { includeSubtitles: false }).overlayFrame
      .visualLayers
  ).toEqual([]);
  expect(
    resolveVideoCompositionRenderPasses(project, 1, { includeSubtitles: true }).overlayFrame
      .visualLayers.length
  ).toBe(1);
});

it('attaches transition overlays to resolved visual passes', verifyTransitionOverlays);

function verifyTransitionOverlays() {
  const project = createTransitionOverlayProject();
  const result = resolveVideoCompositionRenderPasses(project, 3.5);

  expect(result.visualPasses[0]?.transitionOverlays).toEqual([
    expect.objectContaining({ color: '#f97316', kind: 'sweep' }),
  ]);
}

function createTransitionOverlayProject() {
  const project = createEmptyVideoProject('Transition overlays', 1280, 720);
  const trackId = project.tracks[0]?.id ?? '';

  project.clips = [
    createRenderClip(trackId, 'clip-a', 0, 'NONE', 'CROSSFADE'),
    createRenderClip(trackId, 'clip-b', 3, 'CROSSFADE', 'NONE'),
  ] as never;
  project.transitions = [
    {
      direction: 'RIGHT',
      duration: 1,
      easing: 'LINEAR',
      highlightColor: '#f97316',
      id: 'transition-1',
      intensity: 'BOLD',
      kind: 'LIGHT_SWEEP',
      leadingClipId: 'clip-a',
      renderKind: 'CSS_LIKE',
      templateKind: 'LIGHT_SWEEP',
      trailingClipId: 'clip-b',
    },
  ];

  return project;
}

function createRenderClip(
  trackId: string,
  id: string,
  startTime: number,
  transitionIn: 'NONE' | 'CROSSFADE',
  transitionOut: 'NONE' | 'CROSSFADE'
) {
  return {
    assetId: id === 'clip-a' ? 'asset-a' : 'asset-b',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: 'CONTAIN',
    groupId: null,
    id,
    linkMode: 'DETACHED',
    muted: false,
    name: id === 'clip-a' ? 'Clip A' : 'Clip B',
    sourceDuration: 4,
    sourceStart: 0,
    startTime,
    trackId,
    transform: { height: 720, opacity: 1, rotation: 0, width: 1280, x: 0, y: 0 },
    transitionIn,
    transitionOut,
    type: 'VIDEO',
    volume: 1,
  };
}
