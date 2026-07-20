import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectClip,
} from '../../../features/video/project/types';
import { buildInsertedClipResult } from './asset-shared';

function createClip(id: string, trackId: string, timelineLaneId: string): VideoProjectClip {
  return {
    assetId: `${id}-asset`,
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id,
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: id,
    sourceDuration: 4,
    sourceStart: 0,
    startTime: 0,
    timelineLaneId,
    trackId,
    transform: { height: 720, opacity: 1, rotation: 0, width: 1280, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  };
}

it('keeps inserted clips stacked on separate logical lanes without shifting them', () => {
  const project = createEmptyVideoProject('Logical lane insertion', 1280, 720);
  const trackId = project.tracks[0]!.id;
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };
  project.clips = [createClip('upper', trackId, 'line-1')];

  const result = buildInsertedClipResult({
    clips: [createClip('lower', trackId, 'line-2')],
    project,
    selectedClipId: 'lower',
    selectedTrackId: trackId,
  });

  expect(result.project.clips).toEqual([
    expect.objectContaining({ id: 'upper', startTime: 0, timelineLaneId: 'line-1' }),
    expect.objectContaining({ id: 'lower', startTime: 0, timelineLaneId: 'line-2' }),
  ]);
  expect(result.project.transitions ?? []).toEqual([]);
});
