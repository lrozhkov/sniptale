import { describe, expect, it } from 'vitest';
import {
  clampQuickEditZoomRegion,
  createQuickEditZoomRegion,
  insertQuickEditZoomRegion,
  updateQuickEditZoomRegion,
} from './zoom';
import type { QuickEditZoomRegion } from './types';

const region = (
  id: string,
  start: number,
  end: number,
  transform = { scale: 1.5, centerX: 0.5, centerY: 0.5 }
): QuickEditZoomRegion => ({
  id,
  start,
  end,
  transform,
  enter: { type: 'ease-in-out', duration: 0.3 },
  exit: { type: 'ease-in-out', duration: 0.3 },
});

describe('createQuickEditZoomRegion', () => {
  it('creates a default two-second region at the playhead with a ready camera', () => {
    expect(createQuickEditZoomRegion({ id: 'zoom-1', at: 3 })).toEqual({
      id: 'zoom-1',
      start: 3,
      end: 5,
      transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'ease-in-out', duration: 0.3 },
      exit: { type: 'ease-in-out', duration: 0.3 },
    });
  });

  it('keeps the requested region inside the timeline', () => {
    expect(createQuickEditZoomRegion({ id: 'zoom-1', at: 9, endMax: 10 }).end).toBe(10);
    expect(createQuickEditZoomRegion({ id: 'zoom-1', at: 9, duration: 3, endMax: 10 }).end).toBe(
      10
    );
  });
});

describe('updateQuickEditZoomRegion', () => {
  it('replaces the matching region and leaves other regions untouched', () => {
    const regions = [region('a', 0, 2), region('b', 4, 6)];
    const next = updateQuickEditZoomRegion(regions, 'b', { start: 5, end: 8 });
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(regions[0]);
    expect(next[1]).toMatchObject({ id: 'b', start: 5, end: 8 });
  });

  it('keeps camera scale inside the renderer bounds', () => {
    expect(
      updateQuickEditZoomRegion([region('a', 0, 4)], 'a', { scale: 0.5 })[0]!.transform.scale
    ).toBe(1);
    expect(
      updateQuickEditZoomRegion([region('a', 0, 4)], 'a', { scale: 12 })[0]!.transform.scale
    ).toBe(4);
  });

  it('clamps focus coordinates into the normalized video rect', () => {
    const next = updateQuickEditZoomRegion([region('a', 0, 4)], 'a', {
      centerX: 1.4,
      centerY: -0.2,
    })[0]!.transform;
    expect(next.centerX).toBe(1);
    expect(next.centerY).toBe(0);
  });

  it('updates transitions without touching unrelated fields', () => {
    const next = updateQuickEditZoomRegion([region('a', 0, 4)], 'a', {
      enter: { type: 'linear', duration: 0.5 },
    })[0]!;
    expect(next.enter).toEqual({ type: 'linear', duration: 0.5 });
    expect(next.exit).toEqual({ type: 'ease-in-out', duration: 0.3 });
    expect(next.transform).toEqual(region('a', 0, 4).transform);
  });
});

describe('insertQuickEditZoomRegion', () => {
  it('keeps the list ascending by start', () => {
    expect(
      insertQuickEditZoomRegion([region('a', 0, 2), region('b', 4, 6)], region('c', 1, 3)).map(
        (item) => item.id
      )
    ).toEqual(['a', 'c', 'b']);
    expect(
      insertQuickEditZoomRegion([region('a', 0, 2)], region('c', 5, 7)).map((item) => item.id)
    ).toEqual(['a', 'c']);
  });
});

describe('clampQuickEditZoomRegion', () => {
  it('keeps regions between their neighbors without overlap', () => {
    const regions = [region('a', 0, 2), region('b', 4, 6), region('c', 8, 10)];
    expect(clampQuickEditZoomRegion(regions, 'b', 1, 9)).toEqual({ start: 2, end: 8 });
    expect(clampQuickEditZoomRegion(regions, 'b', 7, 9)).toEqual({ start: 7, end: 8 });
    expect(clampQuickEditZoomRegion(regions, 'b', 0, 3)).toEqual({ start: 2, end: 3 });
  });

  it('preserves the region length while clamping a whole-block move', () => {
    const regions = [region('a', 0, 2), region('b', 4, 6), region('c', 9, 10)];
    expect(clampQuickEditZoomRegion(regions, 'b', 2, 4)).toEqual({ start: 2, end: 4 });
  });

  it('keeps a minimal positive length inside a degenerate window', () => {
    const regions = [region('a', 0, 2), region('b', 4, 6)];
    expect(clampQuickEditZoomRegion(regions, 'b', 2, 2)).toEqual({ start: 2, end: 2.001 });
  });
});
