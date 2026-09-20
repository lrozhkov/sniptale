import type { QuickEditSpotlight } from './types';
import { expect, it } from 'vitest';
import {
  createQuickEditSpotlight,
  evaluateQuickEditSpotlightAtTime,
  parseQuickEditSpotlight,
} from './focus';
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
  expect(sample(0)?.opening).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  let width = 1000;
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
  expect(sample(1).opening.width).toBe(700);
  expect(sample(9).opening.width).toBe(400);
  region.spotlight.reveal = 'fade';
  region.spotlight.exitReveal = 'contract';
  expect(sample(1).opening.width).toBe(400);
  expect(sample(9).opening.width).toBe(700);
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
