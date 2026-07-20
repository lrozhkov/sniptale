import { expect, it } from 'vitest';
import type { VideoProjectClip } from '../types/model';
import {
  assignVideoProjectClipsToLogicalLanes,
  createNextVideoProjectTrackLogicalLane,
  getVideoProjectTrackLogicalLaneIds,
  getVideoProjectTrackLogicalLaneIdsThrough,
  normalizeVideoProjectClipLogicalLaneId,
  normalizeVideoProjectLogicalLanes,
  resolveClipLogicalLaneId,
} from './logical-lanes';

function createClip(id: string, timelineLaneId?: string | null): VideoProjectClip {
  return {
    assetId: `${id}-asset`,
    duration: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: 'CONTAIN',
    groupId: null,
    id,
    linkMode: 'DETACHED',
    muted: false,
    name: id,
    startTime: 0,
    trackId: 'track-1',
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    type: 'IMAGE',
    volume: 1,
    ...(timelineLaneId === undefined ? {} : { timelineLaneId }),
  } as VideoProjectClip;
}

it('normalizes empty and non-string logical lane ids to null', () => {
  expect(normalizeVideoProjectClipLogicalLaneId(null)).toBeNull();
  expect(normalizeVideoProjectClipLogicalLaneId('   ')).toBeNull();
  expect(normalizeVideoProjectClipLogicalLaneId(' custom-lane ')).toBe('custom-lane');
});

it('resolves missing clip logical lane ids to the canonical default line', () => {
  expect(resolveClipLogicalLaneId(createClip('clip-a'))).toBe('line-1');
  expect(resolveClipLogicalLaneId(createClip('clip-b', null))).toBe('line-1');
});

it('assigns custom logical lane ids after numeric line ids using stable fallback rows', () => {
  const rows = assignVideoProjectClipsToLogicalLanes([
    createClip('clip-a', 'custom'),
    createClip('clip-b', 'line-3'),
    createClip('clip-c', 'line-1'),
  ]);

  expect(rows.get('clip-a')).toEqual({ logicalLaneId: 'custom', rowCount: 3, rowIndex: 1 });
  expect(rows.get('clip-b')).toEqual({ logicalLaneId: 'line-3', rowCount: 3, rowIndex: 2 });
  expect(rows.get('clip-c')).toEqual({ logicalLaneId: 'line-1', rowCount: 3, rowIndex: 0 });
});

it('keeps empty track-owned logical lanes in row assignment', () => {
  const rows = assignVideoProjectClipsToLogicalLanes([createClip('clip-a')], ['line-1', 'line-2']);

  expect(rows.get('clip-a')).toEqual({ logicalLaneId: 'line-1', rowCount: 2, rowIndex: 0 });
});

it('derives track logical lanes from persisted lanes and legacy clip lane ids', () => {
  const project = {
    clips: [createClip('clip-a', 'line-3'), createClip('clip-b', 'line-1')],
    tracks: [{ id: 'track-1', logicalLanes: [{ id: 'line-2' }, { id: '' }] }],
  };

  expect(normalizeVideoProjectLogicalLanes([{ id: ' line-2 ' }, { id: '' }])).toEqual([
    { id: 'line-2' },
  ]);
  expect(getVideoProjectTrackLogicalLaneIds(project, 'track-1')).toEqual([
    'line-1',
    'line-2',
    'line-3',
  ]);
  expect(createNextVideoProjectTrackLogicalLane(project, 'track-1')).toEqual({ id: 'line-4' });
});

it('materializes intermediate numeric logical lanes through a target line', () => {
  const project = {
    clips: [createClip('clip-a', 'line-1')],
    tracks: [{ id: 'track-1', logicalLanes: [{ id: 'line-1' }] }],
  };

  expect(getVideoProjectTrackLogicalLaneIdsThrough(project, 'track-1', 'line-4')).toEqual([
    'line-1',
    'line-2',
    'line-3',
    'line-4',
  ]);
});
