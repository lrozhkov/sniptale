import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { moveProjectClip } from './mutations';

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 2,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip',
    sourceDuration: 2,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-video',
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
    ...overrides,
  };
}

function createTimelineProject(): VideoProject {
  const project = createEmptyVideoProject('Reachable placement');
  const trackId = project.tracks[0]!.id;
  project.clips = [
    createVideoClip({
      duration: 4,
      id: 'container',
      startTime: 1,
      trackId,
    }),
    createVideoClip({
      duration: 2,
      id: 'moving',
      startTime: 6,
      trackId,
    }),
  ];
  return project;
}

it('keeps moved clips reachable instead of fully hiding them inside another clip', () => {
  const project = createTimelineProject();

  const guardedProject = moveProjectClip(project, 'moving', 3);
  const movedClip = guardedProject.clips.find((clip) => clip.id === 'moving');
  const containerClip = guardedProject.clips.find((clip) => clip.id === 'container');

  expect(movedClip).toEqual(expect.objectContaining({ startTime: 3.1 }));
  expect(containerClip).toBeDefined();
  expect(movedClip!.startTime).toBeGreaterThan(containerClip!.startTime);
  expect(movedClip!.startTime + movedClip!.duration).toBeGreaterThan(
    containerClip!.startTime + containerClip!.duration
  );
});

it('keeps containment guards scoped to the selected logical lane', () => {
  const project = createTimelineProject();
  project.clips = project.clips.map((clip) =>
    clip.id === 'container' ? { ...clip, timelineLaneId: 'line-1' } : clip
  );

  const separateLaneProject = moveProjectClip(project, 'moving', 3, undefined, 'line-2');

  expect(separateLaneProject.clips.find((clip) => clip.id === 'moving')).toEqual(
    expect.objectContaining({ startTime: 3, timelineLaneId: 'line-2' })
  );
});

it('persists intermediate logical lanes when a clip is moved onto a new line', () => {
  const project = createTimelineProject();

  const movedProject = moveProjectClip(project, 'moving', 6, project.tracks[0]!.id, 'line-4');

  expect(movedProject.tracks[0]?.logicalLanes).toEqual([
    { id: 'line-1' },
    { id: 'line-2' },
    { id: 'line-3' },
    { id: 'line-4' },
  ]);
  expect(movedProject.clips.find((clip) => clip.id === 'moving')).toEqual(
    expect.objectContaining({ timelineLaneId: 'line-4' })
  );
});
