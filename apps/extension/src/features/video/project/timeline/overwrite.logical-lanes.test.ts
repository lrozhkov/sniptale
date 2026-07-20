import { expect, it } from 'vitest';
import { applyOverwritePlacement } from './overwrite.helpers.ts';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  type VideoProject,
  VideoProjectClipType,
  type VideoProjectVideoClip,
  VideoTimelinePlacementMode,
  VideoTrackKind,
} from '../types/index';

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip',
    sourceDuration: 4,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-video',
    transform: { height: 720, opacity: 1, rotation: 0, width: 1280, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
    ...overrides,
  };
}

function createProject(clips: VideoProject['clips']): VideoProject {
  return {
    actionEvents: [],
    assets: [],
    backgroundColor: '#000000',
    baseRecordingId: null,
    clips,
    createdAt: 1,
    cursorTrack: null,
    duration: 10,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Logical lanes',
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.OVERWRITE,
    tracks: [
      {
        id: 'track-video',
        kind: VideoTrackKind.PRIMARY,
        locked: false,
        logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
        name: 'Video',
        order: 0,
        visible: true,
      },
    ],
    updatedAt: 1,
    version: 2,
    width: 1280,
  };
}

it('keeps overwrite placement scoped to the clip logical lane', () => {
  const project = createProject([
    createVideoClip({ duration: 6, id: 'upper', startTime: 0, timelineLaneId: 'line-1' }),
    createVideoClip({ duration: 2, id: 'anchor', startTime: 2, timelineLaneId: 'line-2' }),
  ]);

  const result = applyOverwritePlacement(project, ['anchor']);

  expect(result).toBe(project);
  expect(result.clips).toEqual([
    expect.objectContaining({ duration: 6, id: 'upper', timelineLaneId: 'line-1' }),
    expect.objectContaining({ duration: 2, id: 'anchor', timelineLaneId: 'line-2' }),
  ]);
});
