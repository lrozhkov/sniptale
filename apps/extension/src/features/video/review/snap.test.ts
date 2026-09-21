import { describe, expect, it } from 'vitest';
import { getSnapCandidates, snapTimelineTime } from './snap';
import type { ReviewEdit } from './types';

const edit = (start: number, end: number, kind: 'cut' | 'speed' = 'cut'): ReviewEdit =>
  kind === 'speed'
    ? {
        id: `edit-${start}-${end}`,
        kind,
        start,
        end,
        requestedStart: start,
        requestedEnd: end,
        rate: 2,
        audio: 'speed',
      }
    : { id: `edit-${start}-${end}`, kind, start, end, requestedStart: start, requestedEnd: end };

describe('getSnapCandidates', () => {
  it('collects deduplicated sorted edges of every edit plus the playhead', () => {
    expect(
      getSnapCandidates({
        edits: [edit(2, 4), edit(4, 6, 'speed'), edit(0, 8)],
        playhead: 3,
      })
    ).toEqual([0, 2, 3, 4, 6, 8]);
  });

  it('returns the playhead alone when no edits exist', () => {
    expect(getSnapCandidates({ edits: [], playhead: 1.5 })).toEqual([1.5]);
  });

  it('includes neighboring zoom boundaries when provided', () => {
    const zoom = (
      id: string,
      start: number,
      end: number
    ): import('./advanced/types').QuickEditZoomRegion => ({
      id,
      start,
      end,
      transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
    });
    expect(getSnapCandidates({ edits: [], playhead: 3, zoomRegions: [zoom('z', 1, 4)] })).toEqual([
      1, 3, 4,
    ]);
  });

  it('includes media cut boundaries when provided', () => {
    expect(getSnapCandidates({ edits: [edit(2, 4)], playhead: 0, boundaries: [0, 6, 10] })).toEqual(
      [0, 2, 4, 6, 10]
    );
  });
});

describe('snapTimelineTime', () => {
  const candidates = [0, 2, 4, 6, 8, 10];

  it('snaps to the nearest candidate within the threshold and reports it', () => {
    expect(snapTimelineTime(3.9, candidates, 0.2)).toEqual({ time: 4, candidate: 4 });
    expect(snapTimelineTime(2.1, candidates, 0.2)).toEqual({ time: 2, candidate: 2 });
  });

  it('keeps the time and drops the guide beyond the threshold', () => {
    expect(snapTimelineTime(4.21, candidates, 0.2)).toEqual({ time: 4.21, candidate: null });
    expect(snapTimelineTime(5, candidates, 0.2)).toEqual({ time: 5, candidate: null });
  });

  it('snaps at exactly the threshold distance and picks the nearest on ties', () => {
    expect(snapTimelineTime(4.2, candidates, 0.2)).toEqual({ time: 4, candidate: 4 });
    expect(snapTimelineTime(3, [2.6, 3.4], 0.5)).toEqual({ time: 2.6, candidate: 2.6 });
  });

  it('is a no-op without candidates', () => {
    expect(snapTimelineTime(1.234, [], 0.2)).toEqual({ time: 1.234, candidate: null });
  });
});
