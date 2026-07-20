import { expect, it } from 'vitest';
import { hydrateVideoProject } from './index';
import {
  createProject,
  createTrack,
  createVideoClip,
  createImageClip,
  createTextClip,
} from '../timeline/project-meta.test.helpers.ts';
import {
  VideoClipTransitionKind,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../types/index';

it('normalizes shared transition metadata and subtitle track styles during hydration', () => {
  const project = createProject(
    [
      createTextClip({ id: 'clip-text', trackId: 'track-video' }),
      createImageClip({ id: 'clip-image', startTime: 1, trackId: 'track-video' }),
    ],
    [createTrack('track-video', 0), createTrack('track-subtitle', 1, 'SUBTITLE' as never)]
  );
  project.transitions = [
    {
      duration: 1,
      easing: 'bad' as never,
      id: 'transition-valid',
      kind: 'LIGHT_SWEEP' as never,
      leadingClipId: 'clip-text',
      trailingClipId: 'clip-image',
    },
    {
      duration: 1,
      easing: 'LINEAR',
      id: 42 as never,
      kind: 'CROSSFADE' as never,
      leadingClipId: 'clip-text',
      trailingClipId: 'clip-image',
    },
  ];

  const hydrated = hydrateVideoProject(project);

  expect(hydrated.transitions).toEqual([
    expect.objectContaining({
      easing: VideoTransitionEasing.LINEAR,
      kind: VideoTransitionKind.LIGHT_SWEEP,
      renderKind: 'CSS_LIKE',
      templateKind: 'LIGHT_SWEEP',
    }),
  ]);
  expect(hydrated.tracks.find((track) => track.id === 'track-subtitle')).toEqual(
    expect.objectContaining({ subtitleStyle: expect.any(Object) })
  );
});

it('converts legacy clip transition flags into shared project transitions', () => {
  const project = createProject(
    [
      createVideoClip({
        duration: 5,
        id: 'clip-a',
        startTime: 0,
        transitionOut: VideoClipTransitionKind.CROSSFADE,
      }),
      createVideoClip({
        duration: 5,
        id: 'clip-b',
        startTime: 4,
        transitionIn: VideoClipTransitionKind.CROSSFADE,
      }),
    ],
    [createTrack('track-video', 0)]
  );

  const hydrated = hydrateVideoProject(project);

  expect(hydrated.transitions).toEqual([
    expect.objectContaining({
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
    }),
  ]);
});
