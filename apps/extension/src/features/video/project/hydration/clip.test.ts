import { expect, it } from 'vitest';
import { normalizeClip } from './clip';
import { createAnnotationClip } from '../annotation/template';
import { createEmptyVideoProject } from '../factories/creation';
import { VideoMediaShadowMode, VideoProjectClipType } from '../types/index';

function createVideoClipFixture() {
  return {
    assetId: 'asset-1',
    duration: 4,
    fadeInMs: undefined,
    fadeOutMs: undefined,
    fitMode: undefined,
    fitScalePercent: 0,
    groupId: 'group-1',
    id: 'clip-video',
    linkMode: undefined,
    muted: false,
    name: 'Legacy name',
    playbackRate: 2,
    shadowIntensity: 140.5,
    shadowMode: 'invalid',
    sourceDuration: 8,
    sourceStart: 0,
    startTime: 1,
    trackId: 'track-1',
    transform: { height: 720, opacity: 1, rotation: 0, width: 1280, x: 0, y: 0 },
    transitionIn: undefined,
    transitionOut: undefined,
    type: VideoProjectClipType.VIDEO,
    volume: 0.2,
  };
}

it('normalizes grouped media clips with fit, playback, and legacy names', () => {
  const normalized = normalizeClip(
    createVideoClipFixture() as never,
    new Map([['Legacy name', 'Renamed clip']])
  );

  expect(normalized).toEqual(
    expect.objectContaining({
      duration: 4,
      fadeInMs: 0,
      fadeOutMs: 0,
      fitMode: 'CONTAIN',
      fitScalePercent: 1,
      linkMode: 'LINKED',
      name: 'Renamed clip',
      shadowIntensity: 100,
      shadowMode: VideoMediaShadowMode.BACKDROP,
      sourceDuration: 8,
      transitionIn: 'NONE',
      transitionOut: 'NONE',
      volume: 1,
    })
  );
});

it('keeps annotation clip normalization wired through the shared clip hydration seam', () => {
  const project = createEmptyVideoProject('Hydration clip', 1280, 720);
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0);
  clip.target = 'invalid' as never;
  clip.targetPoint = { x: 120, y: 240 };

  const normalized = normalizeClip(clip, new Map());

  expect(normalized).toEqual(
    expect.objectContaining({
      target: 'NONE',
      targetPoint: { x: 120, y: 240 },
      templateKind: 'LOWER_THIRD_BASIC',
      type: 'ANNOTATION',
    })
  );
});
