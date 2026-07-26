import { describe, expect, it } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  getDistanceToFrameBorder,
  resolveFrameHitTarget,
  resolveFrameInteriorHitTarget,
  type FrameHitTarget,
} from './hit-test';

function frame(id: string, x: number, y: number, width: number, height: number): FrameData {
  return { effectMode: 'border', height, id, width, x, y };
}

function resolve(args: {
  frames: FrameData[];
  x: number;
  y: number;
  selectedFrameId?: string | null;
  hoveredFrameId?: string | null;
  directControl?: FrameHitTarget | null;
}) {
  return resolveFrameHitTarget({
    directControl: args.directControl ?? null,
    frames: args.frames,
    hoveredFrameId: args.hoveredFrameId ?? null,
    selectedFrameId: args.selectedFrameId ?? null,
    x: args.x,
    y: args.y,
  });
}

describe('frame border hit testing', () => {
  it('does not treat the interior of a frame as a hover or selection hit', () => {
    const outer = frame('outer', 100, 100, 400, 300);

    expect(getDistanceToFrameBorder(outer, 300, 250)).toBe(150);
    expect(resolve({ frames: [outer], x: 300, y: 250 })).toBeNull();
  });

  it('keeps nested annotations independent and resolves the concrete nearest border', () => {
    const outer = frame('outer', 100, 100, 400, 300);
    const inner = frame('inner', 160, 150, 120, 80);

    expect(resolve({ frames: [outer, inner], x: 101, y: 190 })?.frameId).toBe('outer');
    expect(resolve({ frames: [outer, inner], x: 161, y: 190 })?.frameId).toBe('inner');
  });

  it('resolves each border independently across several nesting levels', () => {
    const outer = frame('outer', 50, 50, 500, 400);
    const middle = frame('middle', 120, 110, 340, 260);
    const inner = frame('inner', 190, 170, 180, 120);
    const frames = [outer, middle, inner];

    expect(resolve({ frames, x: 51, y: 240 })?.frameId).toBe('outer');
    expect(resolve({ frames, x: 121, y: 240 })?.frameId).toBe('middle');
    expect(resolve({ frames, x: 191, y: 240 })?.frameId).toBe('inner');
  });

  it('uses border distance for partially intersecting frames', () => {
    const horizontal = frame('horizontal', 80, 140, 320, 100);
    const vertical = frame('vertical', 220, 60, 100, 300);

    expect(resolve({ frames: [horizontal, vertical], x: 225, y: 145 })?.frameId).toBe('vertical');
    expect(resolve({ frames: [horizontal, vertical], x: 250, y: 143 })?.frameId).toBe('horizontal');
  });

  it('uses a direct trigger or resize handle before overlapping border zones', () => {
    const outer = frame('outer', 100, 100, 300, 200);
    const inner = frame('inner', 106, 106, 288, 188);

    expect(
      resolve({
        directControl: { frameId: 'inner', kind: 'trigger' },
        frames: [outer, inner],
        selectedFrameId: 'outer',
        x: 102,
        y: 102,
      })
    ).toEqual({ frameId: 'inner', kind: 'trigger' });
  });

  it('keeps the selected winner only inside a small dead zone, then follows the nearer border', () => {
    const selected = frame('selected', 100, 100, 200, 120);
    const other = frame('other', 104, 104, 192, 112);

    expect(
      resolve({ frames: [selected, other], selectedFrameId: selected.id, x: 102, y: 160 })?.frameId
    ).toBe('selected');
    expect(
      resolve({ frames: [selected, other], selectedFrameId: selected.id, x: 105, y: 160 })?.frameId
    ).toBe('other');
  });

  it('uses visual stacking and then last-added order for fully coincident frames', () => {
    const first = frame('first', 100, 100, 200, 120);
    const last = frame('last', 100, 100, 200, 120);

    expect(resolve({ frames: [first, last], x: 160, y: 100 })?.frameId).toBe('last');
  });

  it('retains the previous hover winner across near-equal distances without flicker', () => {
    const first = frame('first', 100, 100, 200, 120);
    const second = frame('second', 104, 104, 192, 112);

    expect(
      resolve({ frames: [first, second], hoveredFrameId: 'first', x: 103, y: 160 })?.frameId
    ).toBe('first');
  });
});

describe('frame interior hit testing', () => {
  it('resolves only the area beyond the concrete border hit zone', () => {
    const outer = frame('outer', 100, 100, 400, 300);

    expect(resolveFrameInteriorHitTarget({ frames: [outer], x: 300, y: 250 })).toBe('outer');
    expect(resolveFrameInteriorHitTarget({ frames: [outer], x: 105, y: 250 })).toBeNull();
    expect(resolveFrameInteriorHitTarget({ frames: [outer], x: 95, y: 250 })).toBeNull();
  });

  it('uses the visual top frame for nested and coincident interiors', () => {
    const outer = frame('outer', 100, 100, 400, 300);
    const inner = frame('inner', 160, 150, 120, 80);
    const coincidentLast = frame('coincident-last', 160, 150, 120, 80);

    expect(resolveFrameInteriorHitTarget({ frames: [outer, inner], x: 220, y: 190 })).toBe('inner');
    expect(
      resolveFrameInteriorHitTarget({
        frames: [outer, inner, coincidentLast],
        x: 220,
        y: 190,
      })
    ).toBe('coincident-last');
  });
});
