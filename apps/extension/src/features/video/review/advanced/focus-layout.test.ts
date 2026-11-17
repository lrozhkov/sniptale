import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../project/scene/focus-appearance';
import { expect, it } from 'vitest';
import type { QuickEditZoomRegion } from './types';
const unlink = ({ linkTo: _link, ...region }: QuickEditZoomRegion) => region;
import { createQuickEditZoomRegion, updateQuickEditZoomRegion } from './zoom';
import { evaluateQuickEditSpotlightsAtTime, evaluateQuickEditSpotlightAtTime } from './focus';

import { resolveQuickEditFocusLink } from './focus-layout';
import { evaluateQuickEditCameraAtTime } from './scene';

const focus = (id: string, start: number, end: number, kind: 'zoom' | 'spotlight' | 'border') => ({
  ...createQuickEditZoomRegion({ id, at: start, duration: end - start }),
  ...(kind === 'spotlight'
    ? { spotlight: createQuickEditSpotlight() }
    : kind === 'border'
      ? { border: createQuickEditBorder() }
      : {}),
});
const geometry = {
  output: { width: 800, height: 450 },
  video: { x: 0, y: 0, width: 800, height: 450 },
  scale: 1,
};

it.each(['zoom', 'spotlight'] as const)(
  'blocks %s transitions only across the same focus family in authoring and rendering',
  (kind) => {
    const a = { ...focus('a', 0, 2, kind), linkTo: 'b' };
    const b = focus('b', 6, 8, kind);
    for (const blockerKind of ['zoom', 'spotlight', 'border'] as const) {
      for (const [start, end] of [
        [3, 4],
        [1, 3],
        [5, 7],
        [1, 7],
      ]) {
        const blocker = focus('blocker', start!, end!, blockerKind);
        const regions = [b, blocker, a];
        if (blockerKind !== kind) {
          expect(resolveQuickEditFocusLink(regions, 'a')?.target.id).toBe('b');
          expect(
            updateQuickEditZoomRegion(regions.map(unlink), 'a', { linkTo: 'b' }).find(
              (r) => r.id === 'a'
            )?.linkTo
          ).toBe('b');
          continue;
        }
        expect(resolveQuickEditFocusLink(regions, 'a')).toBeNull();
        expect(
          updateQuickEditZoomRegion(regions.map(unlink), 'a', { linkTo: 'b' }).find(
            (r) => r.id === 'a'
          )?.linkTo
        ).toBeUndefined();
        const expected = regions.map((r) => (r.id === 'a' ? unlink(r) : r));
        expect(evaluateQuickEditCameraAtTime(regions, 4.5)).toEqual(
          evaluateQuickEditCameraAtTime(expected, 4.5)
        );
        expect(evaluateQuickEditSpotlightAtTime({ ...geometry, regions, time: 4.5 })).toEqual(
          evaluateQuickEditSpotlightAtTime({ ...geometry, regions: expected, time: 4.5 })
        );
        expect(evaluateQuickEditSpotlightsAtTime({ ...geometry, regions, time: 4.5 })).toEqual(
          evaluateQuickEditSpotlightsAtTime({ ...geometry, regions: expected, time: 4.5 })
        );
      }
    }
    expect(resolveQuickEditFocusLink([a, b], 'a')?.target.id).toBe('b');
    expect(
      resolveQuickEditFocusLink([a, { ...focus('hidden', 3, 4, 'border'), dormant: true }, b], 'a')
        ?.target.id
    ).toBe('b');
    expect(resolveQuickEditFocusLink([a, focus('touch', 1, 2, 'border'), b], 'a')?.target.id).toBe(
      'b'
    );
    const anchored = [a, b, focus('middle', 9, 10, 'border')].map((r) => ({
      ...r,
      sourceAnchor: r.id === 'middle' ? { start: 3, end: 4 } : { start: r.start, end: r.end },
    }));
    expect(resolveQuickEditFocusLink(anchored, 'a', { sourceTime: true })?.target.id).toBe('b');
  }
);

it('lets the nearer neighbor replace a blocked incoming link without deleting the stored link', () => {
  const a = { ...focus('a', 0, 2, 'spotlight'), linkTo: 'b' };
  const middle = focus('middle', 3, 4, 'spotlight');
  const b = focus('b', 6, 8, 'spotlight');
  const regions = [a, middle, b];
  const updated = updateQuickEditZoomRegion(regions, 'middle', { linkTo: 'b' });
  expect(resolveQuickEditFocusLink(updated, 'middle')?.target.id).toBe('b');
  expect(resolveQuickEditFocusLink(updated, 'a')).toBeNull();
  expect(updated.find((region) => region.id === 'a')?.linkTo).toBe('b');
});

it('retains overlapping camera copies but excludes them from the shared composition until moved clear', async () => {
  const { resolveQuickEditActiveFocusRegions, packQuickEditFocusRows } =
    await import('./focus-layout');
  const { projectReviewFocus } = await import('../focus-edits');
  const { createQuickEditAdvancedState } = await import('./defaults');
  const { loadQuickEditAdvancedState } = await import('./validation');
  const { moveQuickEditZoomRegion } = await import('./zoom');
  const original = { ...focus('original', 1, 3, 'zoom'), sourceAnchor: { start: 1, end: 3 } };
  const copy = { ...original, id: 'copy', overlapPolicy: 'suppress' as const };
  const state = createQuickEditAdvancedState();
  state.zoom = { enabled: true, regions: [original, copy] };
  const restored = loadQuickEditAdvancedState(JSON.parse(JSON.stringify(state)));
  expect(restored?.zoom.regions).toEqual([original, copy]);
  expect(projectReviewFocus(restored!.zoom.regions).map((r) => r.id)).toEqual(['original']);
  expect(packQuickEditFocusRows([original, copy]).get('copy')).toBe(1);
  const moved = moveQuickEditZoomRegion({
    regions: [original, copy],
    id: 'copy',
    requestedStart: 4,
    timelineDuration: 10,
  });
  expect(moved).toEqual({ start: 4, end: 6 });
  const free = { ...copy, ...moved, sourceAnchor: moved };
  expect(projectReviewFocus([original, free]).map((r) => r.id)).toEqual(['original', 'copy']);
  expect(resolveQuickEditActiveFocusRegions([copy]).map((r) => r.id)).toEqual(['copy']);
  expect(
    loadQuickEditAdvancedState({
      ...state,
      zoom: { enabled: true, regions: [original, { ...copy, overlapPolicy: undefined }] },
    })
  ).toBeNull();
  expect(
    loadQuickEditAdvancedState({
      ...state,
      zoom: { enabled: true, regions: [original, { ...copy, overlapPolicy: 'unknown' }] },
    })
  ).toBeNull();
});
