import {
  resolveSceneSpotlightTarget,
  sceneSpotlightOpeningPath,
} from '../../composition/scene-spotlight';
import {
  type QuickEditSpotlight,
  createQuickEditSpotlight,
  parseQuickEditSpotlight,
} from '../../project/scene/focus-appearance';

import { expect, it } from 'vitest';
import { evaluateQuickEditSpotlightAtTime } from './focus';
import {
  createQuickEditZoomRegion,
  resolveQuickEditZoomLink,
  updateQuickEditZoomRegion,
} from './zoom';
import { evaluateQuickEditCameraAtTime } from './scene';

it('validates spotlight bounds and settings and preserves its payload', () => {
  const spotlight = createQuickEditSpotlight();
  expect(parseQuickEditSpotlight(spotlight)).toEqual(spotlight);
  for (const bad of [
    { ...spotlight, blur: Infinity },
    { ...spotlight, effect: 'unknown' },
    { ...spotlight, strength: -1 },
    { ...spotlight, area: { ...spotlight.area, x: 0.9 } },
  ])
    expect(parseQuickEditSpotlight(bad)).toBeNull();
});

it('moves a following lens on the source clock and keeps a docked lens fixed', () => {
  const region = {
    ...createQuickEditZoomRegion({ id: 'lens', at: 0, duration: 2 }),
    spotlight: {
      ...createQuickEditSpotlight(),
      effect: 'magnify' as const,
      area: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
    },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
    followCursor: true,
    cursorFocus: {
      timeMap: [
        {
          kind: 'speed' as const,
          sourceStart: 0,
          sourceEnd: 4,
          resultStart: 0,
          resultEnd: 2,
          rate: 2,
        },
      ],
      path: {
        version: 1 as const,
        mode: 'follow' as const,
        gapPolicy: 'hold' as const,
        smoothing: 0,
        sensitivity: 0.5,
        segments: [
          {
            id: 'path',
            binding: { kind: 'project' as const },
            start: 0,
            end: 4,
            keys: [
              {
                id: 'a',
                time: 0,
                x: 0.2,
                y: 0.3,
                anchor: 'manual' as const,
                interpolation: 'linear' as const,
              },
              {
                id: 'b',
                time: 4,
                x: 0.8,
                y: 0.7,
                anchor: 'manual' as const,
                interpolation: 'linear' as const,
              },
            ],
          },
        ],
      },
    },
  };
  const sample = (following: boolean) =>
    evaluateQuickEditSpotlightAtTime({
      regions: [{ ...region, followCursor: following }],
      time: 1,
      output: { width: 100, height: 100 },
      video: { x: 0, y: 0, width: 100, height: 100 },
      scale: 1,
    })!;
  expect(sample(true).opening).toEqual({ x: 40, y: 40, width: 20, height: 20 });
  expect(sample(false).opening).toEqual({ x: 10, y: 20, width: 20, height: 20 });
  expect(sample(true).lens).toEqual({ scale: 2, optics: 'flat' });
});
it('contracts monotonically over the full scene without moving the camera', () => {
  const region = {
    ...createQuickEditZoomRegion({ id: 's', at: 0, duration: 60 }),
    spotlight: { ...createQuickEditSpotlight(), reveal: 'contract' as const },
    enter: { type: 'linear' as const, duration: 30 },
    exit: { type: 'linear' as const, duration: 30 },
  };
  const sample = (time: number) =>
    evaluateQuickEditSpotlightAtTime({
      regions: [region],
      time,
      output: { width: 1000, height: 800 },
      video: { x: 100, y: 100, width: 800, height: 600 },
      scale: 1,
    });
  expect(sample(0)!.opening.x).toBeLessThan(0);
  expect(sample(0)!.opening.y).toBeLessThan(0);
  let width = sample(0)!.opening.width;
  for (let i = 0; i <= 1800; i++) {
    const frame = sample(i / 60)!;
    expect(frame.opening.width).toBeLessThanOrEqual(width);
    width = frame.opening.width;
  }
  expect(sample(30)?.opening).toEqual({ x: 300, y: 250, width: 400, height: 300 });
  expect(sample(45)?.dim).toBeCloseTo(0.325);
  expect(sample(60)).toBeNull();
  expect(evaluateQuickEditCameraAtTime([region], 30).scale).toBe(1);
});
it('rejects cross-type links and removes both incompatible edges on a type change', () => {
  const a = { ...createQuickEditZoomRegion({ id: 'a', at: 0 }), linkTo: 'b' };
  const b = { ...createQuickEditZoomRegion({ id: 'b', at: 3 }), linkTo: 'c' };
  const c = createQuickEditZoomRegion({ id: 'c', at: 6 });
  const changed = updateQuickEditZoomRegion([a, b, c], 'b', {
    spotlight: createQuickEditSpotlight(),
  });
  expect(changed[0]?.linkTo).toBeUndefined();
  expect(changed[1]?.linkTo).toBeUndefined();
  expect(
    resolveQuickEditZoomLink([a, { ...b, spotlight: createQuickEditSpotlight() }], 'a')
  ).toBeNull();
});

it('moves linked openings and blends dim into blur without a camera jump', () => {
  const a = {
    ...createQuickEditZoomRegion({ id: 'a', at: 0 }),
    linkTo: 'b',
    spotlight: createQuickEditSpotlight(),
  };
  const b = {
    ...createQuickEditZoomRegion({ id: 'b', at: 4 }),
    spotlight: {
      ...createQuickEditSpotlight(),
      effect: 'blur' as const,
      area: { x: 0.5, y: 0.5, width: 0.25, height: 0.25 },
    },
  };
  const frame = evaluateQuickEditSpotlightAtTime({
    regions: [a, b],
    time: 3,
    output: { width: 100, height: 100 },
    video: { x: 0, y: 0, width: 100, height: 100 },
    scale: 0.5,
  })!;
  expect(frame.opening).toEqual({ x: 37.5, y: 37.5, width: 37.5, height: 37.5 });
  expect(frame.dim).toBeCloseTo(0.325);
  expect(frame.blur).toBe(3);
  expect(evaluateQuickEditCameraAtTime([a, b], 3).scale).toBe(1);
});

it('animates entry and exit openings independently with the shared phase clock', () => {
  const spotlight: QuickEditSpotlight = {
    ...createQuickEditSpotlight(),
    reveal: 'contract',
    exitReveal: 'fade',
  };
  const region = {
    ...createQuickEditZoomRegion({ id: 'asymmetric', at: 0, duration: 10 }),
    enter: { type: 'linear' as const, duration: 2 },
    exit: { type: 'linear' as const, duration: 2 },
    spotlight,
  };
  const sample = (time: number) =>
    evaluateQuickEditSpotlightAtTime({
      regions: [region],
      time,
      output: { width: 1000, height: 800 },
      video: { x: 100, y: 100, width: 800, height: 600 },
      scale: 1,
    })!;
  const expandedWidth = sample(1).opening.width;
  expect(expandedWidth).toBeGreaterThan(400);
  expect(sample(9).opening.width).toBe(400);
  region.spotlight.reveal = 'fade';
  region.spotlight.exitReveal = 'contract';
  expect(sample(1).opening.width).toBe(400);
  expect(sample(9).opening.width).toBe(expandedWidth);
});

it('defaults a saved single animation at ingress and rejects malformed exit animation', () => {
  const { exitReveal: _exit, ...saved } = createQuickEditSpotlight();
  expect(parseQuickEditSpotlight({ ...saved, reveal: 'contract' })).toMatchObject({
    reveal: 'contract',
    exitReveal: 'contract',
  });
  expect(parseQuickEditSpotlight({ ...saved, exitReveal: 'unknown' })).toBeNull();
  expect(parseQuickEditSpotlight({ ...saved, exitReveal: null })).toBeNull();
  const value = { ...createQuickEditSpotlight(), exitReveal: 'contract' as const };
  expect(parseQuickEditSpotlight(value)).toEqual(value);
});

it.each([false, true])(
  'preserves mixed lens contour endpoints through Gallery links (reverse=%s)',
  (reverse) => {
    const legacy = { ...createQuickEditSpotlight(), effect: 'magnify' as const, roundness: 0.5 };
    const circle = { ...legacy, lensShape: 'circle' as const };
    const a = {
      ...createQuickEditZoomRegion({ id: 'a', at: 0, duration: 2 }),
      linkTo: 'b',
      spotlight: reverse ? circle : legacy,
    };
    const b = {
      ...createQuickEditZoomRegion({ id: 'b', at: 4, duration: 2 }),
      spotlight: reverse ? legacy : circle,
    };
    const video = { x: 0, y: 0, width: 400, height: 400 };
    const sample = (time: number) =>
      evaluateQuickEditSpotlightAtTime({ regions: [a, b], time, video, output: video, scale: 1 })!;
    expect(sceneSpotlightOpeningPath(sample(2))).toBe(
      sceneSpotlightOpeningPath(resolveSceneSpotlightTarget(a.spotlight, video, 1))
    );
    expect(sceneSpotlightOpeningPath(sample(3))).toContain('C');
    expect(sceneSpotlightOpeningPath(sample(4))).toBe(
      sceneSpotlightOpeningPath(resolveSceneSpotlightTarget(b.spotlight, video, 1))
    );
  }
);
