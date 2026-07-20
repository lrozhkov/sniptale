import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProject,
} from '../../../../features/video/project/types';
import { closeProjectTrackGap } from './mutations';

it('closes a gap from the nearest preceding clip end across logical lanes', () => {
  const project = createLogicalLaneGapProject();
  const trackId = project.tracks[0]!.id;

  const closedProject = closeProjectTrackGap(project, trackId, 5, 8);

  expect(closedProject.clips.find((clip) => clip.id === 'clip-long')?.startTime).toBe(0);
  expect(closedProject.clips.find((clip) => clip.id === 'clip-short')?.startTime).toBe(4);
  expect(closedProject.clips.find((clip) => clip.id === 'clip-trailing')?.startTime).toBe(5);
});

function createLogicalLaneGapProject(): VideoProject {
  const project = createEmptyVideoProject('Logical lane gap');
  const trackId = project.tracks[0]!.id;

  return {
    ...project,
    clips: [
      createVideoClip('clip-long', trackId, 0, 5, 'line-1'),
      createVideoClip('clip-short', trackId, 4, 0.5, 'line-2'),
      createVideoClip('clip-trailing', trackId, 8, 1, 'line-1'),
    ],
    tracks: [
      {
        ...project.tracks[0]!,
        logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
      },
      ...project.tracks.slice(1),
    ],
  };
}

function createVideoClip(
  id: string,
  trackId: string,
  startTime: number,
  duration: number,
  timelineLaneId: string
) {
  return {
    assetId: `asset-${id}`,
    duration,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id,
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: id,
    sourceDuration: duration,
    sourceStart: 0,
    startTime,
    timelineLaneId,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  };
}
