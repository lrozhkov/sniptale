import { expect, it } from 'vitest';
import {
  createQuickEditSpotlight,
  parseQuickEditSpotlight,
} from '../project/scene/focus-appearance';
import { resolveSceneSpotlightTarget, sampleSceneSpotlight } from './scene-spotlight';

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
