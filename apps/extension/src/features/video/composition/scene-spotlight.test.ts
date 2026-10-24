import { expect, it } from 'vitest';
import {
  createQuickEditSpotlight,
  parseQuickEditSpotlight,
  placeQuickEditLens,
  resolveQuickEditLensArea,
  authorQuickEditLensArea,
} from '../project/scene/focus-appearance';
import {
  resolveSceneSpotlightTarget,
  sampleSceneSpotlight,
  sceneSpotlightOpeningPath,
} from './scene-spotlight';

it.each([
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
  { width: 600, height: 600 },
])(
  'keeps a 50 percent circle round in $width by $height domains and re-encodes its authored area',
  (window) => {
    const value = {
      ...createQuickEditSpotlight(),
      effect: 'magnify' as const,
      lensShape: 'circle' as const,
    };
    const frame = resolveSceneSpotlightTarget(value, { x: 0, y: 0, ...window }, 1);
    expect(frame.opening.width).toBeCloseTo(Math.min(window.width, window.height) / 2, 10);
    expect(frame.opening.height).toBeCloseTo(frame.opening.width, 10);
    expect(frame.radius).toBe(frame.opening.width / 2);
    expect(sceneSpotlightOpeningPath(frame)).toContain('A');
    const area = resolveQuickEditLensArea(value, window);
    expect(authorQuickEditLensArea(value, area)).toEqual(value.area);
    expect(parseQuickEditSpotlight(JSON.parse(JSON.stringify(value)))).toEqual(value);
  }
);

it('preserves legacy shape omission and refuses malformed shapes without accepting out-of-frame authored areas', () => {
  const value = { ...createQuickEditSpotlight(), effect: 'magnify' as const };
  expect(parseQuickEditSpotlight(value)).not.toHaveProperty('lensShape');
  for (const lensShape of ['ellipse', 0, null, true, {}])
    expect(parseQuickEditSpotlight({ ...value, lensShape })).toBeNull();
  expect(parseQuickEditSpotlight({ ...value, area: { ...value.area, x: -0.1 } })).toBeNull();
});

it.each([
  { x: 0, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 0 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0 },
  { x: 1, y: 1 },
])(
  'keeps a following lens centered on edge cursor $x,$y without changing its authored dock',
  (point) => {
    const authored = { ...createQuickEditSpotlight(), effect: 'magnify' as const };
    const placed = placeQuickEditLens(authored, point);
    expect(placed.area.x + placed.area.width / 2).toBe(point.x);
    expect(placed.area.y + placed.area.height / 2).toBe(point.y);
    expect(placed.area.width).toBe(authored.area.width);
    expect(placed.area.height).toBe(authored.area.height);
    expect(authored.area).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  }
);

it('samples fade and independent blur at evaluated phase progress', () => {
  const spotlight = createQuickEditSpotlight();
  const args = {
    spotlight,
    window: { x: 100, y: 50, width: 400, height: 200 },
    extent: { x: 0, y: 0, width: 800, height: 600 },
    scale: 2,
    phase: 'enter' as const,
    progress: 0.25,
  };
  expect(sampleSceneSpotlight(args)).toEqual({
    opening: { x: 200, y: 100, width: 200, height: 100 },
    radius: 1,
    dim: 0.1625,
    blur: 0,
  });
  expect(
    sampleSceneSpotlight({ ...args, spotlight: { ...spotlight, effect: 'blur' } })
  ).toMatchObject({ dim: 0, blur: 6 });
});

it('expands contract openings over translated extents without moving their center', () => {
  const spotlight = { ...createQuickEditSpotlight(), reveal: 'contract' as const };
  const args = {
    spotlight,
    window: { x: 0, y: 0, width: 400, height: 200 },
    extent: { x: -800, y: -500, width: 1600, height: 1000 },
    scale: 1,
    phase: 'enter' as const,
  };
  const target = resolveSceneSpotlightTarget(spotlight, args.window, 1);
  const expanded = sampleSceneSpotlight({ ...args, progress: 0 });
  expect(expanded.opening.x).toBeLessThan(-800);
  expect(expanded.opening.y).toBeLessThan(-500);
  expect(expanded.opening.x + expanded.opening.width).toBeGreaterThan(800);
  expect(expanded.opening.y + expanded.opening.height).toBeGreaterThan(500);
  expect(expanded.opening.x + expanded.opening.width / 2).toBe(200);
  expect(expanded.opening.y + expanded.opening.height / 2).toBe(100);
  expect(sampleSceneSpotlight({ ...args, progress: 1 })).toEqual(target);
});

it('morphs evaluated compatible endpoints without applying an entrance expansion', () => {
  const spotlight = { ...createQuickEditSpotlight(), effect: 'blur' as const };
  const from = { opening: { x: 10, y: 20, width: 40, height: 60 }, radius: 5, dim: 0.8, blur: 0 };
  const args = {
    spotlight,
    from,
    window: { x: 0, y: 0, width: 400, height: 200 },
    extent: { x: 0, y: 0, width: 400, height: 200 },
    scale: 1,
    phase: 'enter' as const,
  };
  expect(sampleSceneSpotlight({ ...args, progress: 0 })).toEqual(from);
  expect(sampleSceneSpotlight({ ...args, progress: 0.5 })).toEqual({
    opening: { x: 55, y: 35, width: 120, height: 80 },
    radius: 4.5,
    dim: 0.4,
    blur: 6,
  });
  expect(sampleSceneSpotlight({ ...args, progress: 1 })).toEqual(
    resolveSceneSpotlightTarget(spotlight, args.window, 1)
  );
});

it('admits persisted lens optics and interpolates magnification over an interval', () => {
  const authored = {
    ...createQuickEditSpotlight(),
    effect: 'magnify' as const,
    magnification: 2.5,
    lensOptics: 'optical' as const,
  };
  const spotlight = parseQuickEditSpotlight(authored)!;
  expect(spotlight).toEqual(authored);
  expect(parseQuickEditSpotlight({ ...authored, lensOptics: 'fisheye' })).toBeNull();
  expect(parseQuickEditSpotlight({ ...authored, magnification: 5 })).toBeNull();
  const args = {
    spotlight,
    window: { x: 100, y: 50, width: 400, height: 200 },
    extent: { x: 0, y: 0, width: 800, height: 600 },
    scale: 1,
    phase: 'enter' as const,
  };
  expect(sampleSceneSpotlight({ ...args, progress: 0 }).lens).toEqual({
    scale: 1,
    optics: 'optical',
  });
  expect(sampleSceneSpotlight({ ...args, progress: 0.5 }).lens).toEqual({
    scale: 1.75,
    optics: 'optical',
  });
  expect(sampleSceneSpotlight({ ...args, progress: 1 }).lens).toEqual({
    scale: 2.5,
    optics: 'optical',
  });
});

it('keeps legacy rim width absent, admits bounded widths and projects the authored shoulder', () => {
  const legacy = {
    ...createQuickEditSpotlight(),
    effect: 'magnify' as const,
    lensOptics: 'optical' as const,
  };
  expect(parseQuickEditSpotlight(legacy)).not.toHaveProperty('lensEdgeWidth');
  for (const lensEdgeWidth of [1, 8, 30]) {
    const spotlight = parseQuickEditSpotlight({ ...legacy, lensEdgeWidth })!;
    expect(spotlight.lensEdgeWidth).toBe(lensEdgeWidth);
    const frame = resolveSceneSpotlightTarget(
      spotlight,
      { x: 0, y: 0, width: 640, height: 360 },
      1
    );
    expect(frame.lens).toMatchObject({ optics: 'optical', edgeWidth: lensEdgeWidth });
  }
  for (const lensEdgeWidth of [0, 31, NaN, Infinity, '8', null])
    expect(parseQuickEditSpotlight({ ...legacy, lensEdgeWidth })).toBeNull();
});

it.each(['enter', 'exit'] as const)(
  'keeps an explicit circle round throughout standalone %s fade',
  (phase) => {
    const spotlight = {
      ...createQuickEditSpotlight(),
      effect: 'magnify' as const,
      lensShape: 'circle' as const,
    };
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const frame = sampleSceneSpotlight({
        spotlight,
        phase,
        progress,
        scale: 1,
        window: { x: 0, y: 0, width: 400, height: 200 },
        extent: { x: 0, y: 0, width: 400, height: 200 },
      });
      expect(frame.opening.width).toBe(100);
      expect(frame.opening.height).toBe(100);
      expect(frame.radius).toBe(50);
    }
  }
);

it('keeps the intermediate circular cubic approximation below five millionths of its radius', () => {
  const path = sceneSpotlightOpeningPath({
    opening: { x: 0, y: 0, width: 2, height: 2 },
    radius: 1,
    arcMix: 1,
  });
  const segments = [...path.matchAll(/C([^CHVZ]+)/gu)].slice(0, 2);
  let start = [1, 0];
  for (const segment of segments) {
    const points = segment[1]!.trim().split(/\s+/u).map(Number);
    for (let step = 0; step <= 100; step++) {
      const t = step / 100,
        u = 1 - t;
      const coordinate = (axis: number) =>
        u * u * u * start[axis]! +
        3 * u * u * t * points[axis]! +
        3 * u * t * t * points[axis + 2]! +
        t * t * t * points[axis + 4]!;
      expect(Math.abs(Math.hypot(coordinate(0) - 1, coordinate(1) - 1) - 1)).toBeLessThan(0.000005);
    }
    start = points.slice(4, 6);
  }
});
