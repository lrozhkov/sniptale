import { expect, it } from 'vitest';

import { syncProjectDuration } from './basics';
import {
  createImageClip,
  createProject,
  createTrack,
  createVideoClip,
} from './project-meta.test.helpers.ts';
import { VideoClipTransitionKind, VideoTransitionKind } from '../types/index';

it('synchronizes overlap transitions into shared project transition entities', () => {
  const project = createProject(
    [
      createVideoClip({
        duration: 5,
        id: 'clip-a',
        startTime: 0,
        timelineLaneId: 'line-1',
        transitionOut: VideoClipTransitionKind.CROSSFADE,
      }),
      createImageClip({
        duration: 3,
        id: 'clip-b',
        startTime: 4,
        timelineLaneId: 'line-1',
        transitionIn: VideoClipTransitionKind.CROSSFADE,
      }),
    ],
    [createTrack('track-video', 0)]
  );

  expect(syncProjectDuration(project).transitions).toEqual([
    expect.objectContaining({
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
    }),
  ]);
});
