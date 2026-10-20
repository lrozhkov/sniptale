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
  'blocks %s transitions across every active focus type in authoring and rendering',
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
    expect(resolveQuickEditFocusLink(anchored, 'a', { sourceTime: true })).toBeNull();
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
