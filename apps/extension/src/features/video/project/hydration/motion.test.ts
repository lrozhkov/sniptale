import { expect, it } from 'vitest';
import { hydrateVideoProject } from './index';
import { createImageClip, createProject } from '../timeline/project-meta.test.helpers.ts';
import { VideoMotionFocusMode, VideoTemporalEasing } from '../types/index';

it('normalizes motion regions alongside cursor interpolation metadata', () => {
  const project = createProject([createImageClip({ groupId: null })]);

  project.duration = 4;
  project.actionEvents = [
    {
      data: {},
      duration: 0.4,
      id: 'action-1',
      kind: 'CLICK' as never,
      label: 'Click',
      point: { x: 20, y: 30 },
      preset: 'CLICK_RIPPLE' as never,
      time: 1,
    },
  ];
  project.motionRegions = [
    {
      duration: Number.POSITIVE_INFINITY,
      easing: 'bad' as never,
      focusMode: VideoMotionFocusMode.ACTION,
      focusPoint: { x: -50, y: 10000 },
      id: 'motion-1',
      motionBlurAmount: 2,
      scale: 8,
      startTime: 10,
      targetActionEventId: 'action-1',
      zoomInDuration: 99,
      zoomOutDuration: 99,
    },
  ];

  const hydrated = hydrateVideoProject(project);

  expect(hydrated.motionRegions).toEqual([
    expect.objectContaining({
      duration: 0.1,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusPoint: { x: 0, y: hydrated.height },
      motionBlurAmount: 1,
      scale: 4,
      startTime: 3.9,
      targetActionEventId: 'action-1',
      zoomInDuration: 0.1,
      zoomOutDuration: 0.1,
    }),
  ]);
});
