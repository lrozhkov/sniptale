import { createGlTransitionSelection } from '../transition/gl-catalog';
import { expect, it } from 'vitest';
import { hydrateVideoProject } from './index';
import {
  createProject,
  createTrack,
  createVideoClip,
  createImageClip,
  createTextClip,
} from '../timeline/project-meta.test.helpers.ts';
import { VideoClipTransitionKind, VideoTransitionEasing } from '../types/index';

it('preserves exact GL metadata and supplies subtitle track styles during hydration', () => {
  const project = createProject(
    [
      createTextClip({ id: 'clip-text', trackId: 'track-video', duration: 5 }),
      createImageClip({ id: 'clip-image', startTime: 1, trackId: 'track-video', duration: 5 }),
    ],
    [createTrack('track-video', 0), createTrack('track-subtitle', 1, 'SUBTITLE')]
  );
  const selection = createGlTransitionSelection('CrossZoom')!;
  selection.values['strength'] = 0.73;
  project.transitions = [
    {
      id: 'explicit',
      leadingClipId: 'clip-text',
      trailingClipId: 'clip-image',
      kind: 'gl',
      selection,
      duration: 4,
      easing: VideoTransitionEasing.EASE_IN_OUT,
      presetId: 'my-preset',
    },
  ];
  const original = structuredClone(project);
  const hydrated = hydrateVideoProject(project);
  expect(hydrated.transitions).toEqual(original.transitions);
  expect(project).toEqual(original);
  expect(hydrated.tracks.find((track) => track.id === 'track-subtitle')).toEqual(
    expect.objectContaining({ subtitleStyle: expect.any(Object) })
  );
});

it('refuses unsupported transition data without dropping entries or changing the input document', () => {
  const project = createProject([
    createVideoClip({ id: 'A' }),
    createVideoClip({ id: 'B', startTime: 1 }),
  ]);
  Reflect.set(project, 'transitions', [
    {
      id: 'legacy',
      leadingClipId: 'A',
      trailingClipId: 'B',
      kind: 'LIGHT_SWEEP',
      duration: 1,
      easing: 'LINEAR',
    },
  ]);
  const original = structuredClone(project);
  expect(() => hydrateVideoProject(project)).toThrow('Unsupported explicit project transition.');
  expect(project).toEqual(original);
});

it.each([false, true])(
  'does not manufacture transitions on project opening, with old flags=%s',
  (flags) => {
    const project = createProject(
      [
        createVideoClip({
          duration: 5,
          id: 'clip-a',
          startTime: 0,
          transitionOut: flags ? VideoClipTransitionKind.CROSSFADE : VideoClipTransitionKind.NONE,
        }),
        createVideoClip({
          duration: 5,
          id: 'clip-b',
          startTime: 4,
          transitionIn: flags ? VideoClipTransitionKind.CROSSFADE : VideoClipTransitionKind.NONE,
        }),
      ],
      [createTrack('track-video', 0)]
    );

    const hydrated = hydrateVideoProject(project);

    expect(hydrated.transitions).toEqual([]);
    expect(hydrated.clips.map((clip) => [clip.transitionIn, clip.transitionOut])).toEqual([
      [VideoClipTransitionKind.NONE, VideoClipTransitionKind.NONE],
      [VideoClipTransitionKind.NONE, VideoClipTransitionKind.NONE],
    ]);
  }
);
