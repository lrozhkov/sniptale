import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { resolveTimelineSnap, snapTimelineTime } from './snap';

function addClip(project: ReturnType<typeof createEmptyVideoProject>) {
  project.clips = [
    {
      id: 'clip-1',
      trackId: project.tracks[0]!.id,
      type: VideoProjectClipType.VIDEO,
      name: 'Clip',
      groupId: null,
      linkMode: VideoClipLinkMode.DETACHED,
      startTime: 5,
      duration: 3,
      muted: false,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
      assetId: 'asset-1',
      fitMode: VideoMediaFitMode.CONTAIN,
      sourceStart: 0,
      sourceDuration: 3,
    },
  ];
}

it('excludes the active clip own edge even when it is inside the snap threshold', () => {
  const project = createEmptyVideoProject('Self exclusion');
  addClip(project);

  expect(resolveTimelineSnap(5.2, project, 10).targetTime).toBe(5);
  expect(
    resolveTimelineSnap(5.2, project, 10, {
      excludedClipId: 'clip-1',
      includeMotionRegions: false,
    })
  ).toEqual({ targetTime: null, time: 5.2 });
});

it('preserves motion-region targets for the existing effect snapping policy', () => {
  const project = createEmptyVideoProject('Effect compatibility');
  project.motionRegions = [{ id: 'motion-1', startTime: 6.5, duration: 1 }] as never;

  expect(snapTimelineTime(6.4, project, 10)).toBe(6.5);
  expect(resolveTimelineSnap(6.4, project, 10, { includeMotionRegions: false })).toEqual({
    targetTime: null,
    time: 6.4,
  });
});
