import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import type { VideoProjectClip } from '../../../../features/video/project/types';
import { buildTimelineTrackClipRows } from './stacking';

function createClip(id: string, trackId: string, startTime: number, duration: number) {
  return {
    assetId: `${id}-asset`,
    duration,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: 'CONTAIN',
    groupId: null,
    id,
    linkMode: 'DETACHED',
    muted: false,
    name: id,
    startTime,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    type: 'IMAGE',
    volume: 1,
  } as VideoProjectClip;
}

it('keeps clips without an explicit lane on the canonical default logical row', () => {
  const project = createEmptyVideoProject('Stacking');
  const trackId = project.tracks[0]!.id;
  project.clips = [
    createClip('clip-a', trackId, 0, 4),
    createClip('clip-b', trackId, 1, 2),
    createClip('clip-c', trackId, 4, 1),
  ];

  const rows = buildTimelineTrackClipRows(project, trackId);

  expect(rows.get('clip-a')).toEqual({ logicalLaneId: 'line-1', rowCount: 1, rowIndex: 0 });
  expect(rows.get('clip-b')).toEqual({ logicalLaneId: 'line-1', rowCount: 1, rowIndex: 0 });
  expect(rows.get('clip-c')).toEqual({ logicalLaneId: 'line-1', rowCount: 1, rowIndex: 0 });
});

it('keeps explicit overlapping clips on the same logical line', () => {
  const project = createEmptyVideoProject('Explicit stacking');
  const trackId = project.tracks[0]!.id;
  const firstClip = createClip('clip-a', trackId, 0, 4);
  const secondClip = createClip('clip-b', trackId, 1, 2);
  firstClip.timelineLaneId = 'line-1';
  secondClip.timelineLaneId = 'line-1';
  project.clips = [firstClip, secondClip];

  const rows = buildTimelineTrackClipRows(project, trackId);

  expect(rows.get('clip-a')).toEqual({ logicalLaneId: 'line-1', rowCount: 1, rowIndex: 0 });
  expect(rows.get('clip-b')).toEqual({ logicalLaneId: 'line-1', rowCount: 1, rowIndex: 0 });
});

it('places explicit clip lanes as nested rows inside a track', () => {
  const project = createEmptyVideoProject('Explicit rows');
  const trackId = project.tracks[0]!.id;
  const firstClip = createClip('clip-a', trackId, 0, 4);
  const secondClip = createClip('clip-b', trackId, 1, 2);
  firstClip.timelineLaneId = 'line-1';
  secondClip.timelineLaneId = 'line-2';
  project.clips = [firstClip, secondClip];

  const rows = buildTimelineTrackClipRows(project, trackId);

  expect(rows.get('clip-a')).toEqual({ logicalLaneId: 'line-1', rowCount: 2, rowIndex: 0 });
  expect(rows.get('clip-b')).toEqual({ logicalLaneId: 'line-2', rowCount: 2, rowIndex: 1 });
});

it('counts empty persisted logical lanes before clips are placed on them', () => {
  const project = createEmptyVideoProject('Empty logical row');
  const trackId = project.tracks[0]!.id;
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };
  project.clips = [createClip('clip-a', trackId, 0, 4)];

  const rows = buildTimelineTrackClipRows(project, trackId);

  expect(rows.get('clip-a')).toEqual({ logicalLaneId: 'line-1', rowCount: 2, rowIndex: 0 });
});
