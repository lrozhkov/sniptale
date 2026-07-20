import { expect, it } from 'vitest';
import { getClipTransitionMultiplier, getClipTransitionOverlapDurations } from './presentation';
import { createProject, createVideoClip } from './project-meta.test.helpers.ts';
import {
  VideoClipTransitionKind,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../types/index';

it('keeps transition values stable when no overlapping neighbours exist', () => {
  const isolatedClip = createVideoClip({
    id: 'isolated',
    startTime: 2,
    transitionIn: VideoClipTransitionKind.CROSSFADE,
    transitionOut: VideoClipTransitionKind.CROSSFADE,
  });
  const project = createProject([isolatedClip]);

  expect(getClipTransitionMultiplier(project, isolatedClip, 2.5)).toBe(1);
  expect(getClipTransitionOverlapDurations(project, isolatedClip)).toEqual({
    incomingMs: 0,
    outgoingMs: 0,
  });
});

it('reads overlap durations and multipliers from normalized project transition owners', () => {
  const incomingClip = createVideoClip({
    duration: 4,
    id: 'incoming',
    startTime: 0,
    transitionOut: VideoClipTransitionKind.CROSSFADE,
  });
  const targetClip = createVideoClip({
    duration: 4,
    id: 'target',
    startTime: 3,
    transitionIn: VideoClipTransitionKind.CROSSFADE,
  });
  const project = createProject([incomingClip, targetClip]);
  project.transitions = [
    {
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'transition-1',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'incoming',
      trailingClipId: 'target',
    },
  ];

  expect(getClipTransitionMultiplier(project, targetClip, 3.5)).toBeCloseTo(0.5);
  expect(getClipTransitionOverlapDurations(project, targetClip)).toEqual({
    incomingMs: 1000,
    outgoingMs: 0,
  });
});
