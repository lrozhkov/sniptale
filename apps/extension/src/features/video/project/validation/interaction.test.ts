import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoProjectMotionRegion } from '../motion';
import { isMotionRegion } from './interaction';

it('accepts an authored zoom interval and rejects malformed persisted intervals', () => {
  const region = createVideoProjectMotionRegion(createEmptyVideoProject('Zoom'), 0);
  expect(isMotionRegion(region)).toBe(true);
  expect(isMotionRegion({ ...region, animation: { start: 2, end: 4, duration: 6 } })).toBe(true);
  for (const animation of [
    null,
    'range',
    {},
    { start: -1, end: 4, duration: 6 },
    { start: 2, end: 2, duration: 6 },
    { start: 2, end: 7, duration: 6 },
    { start: NaN, end: 4, duration: 6 },
    { start: 2, end: 4, duration: Infinity },
  ]) {
    expect(isMotionRegion({ ...region, animation })).toBe(false);
  }
});

it('validates retained action animation intervals at the persistence boundary', async () => {
  const { isActionEvent } = await import('./interaction');
  const event = {
    id: 'click',
    kind: 'CLICK',
    time: 2,
    duration: 1,
    point: null,
    label: '',
    data: {},
    preset: 'CLICK_RIPPLE',
  };
  expect(isActionEvent(event)).toBe(true);
  expect(isActionEvent({ ...event, animation: { start: 1, end: 2, duration: 4 } })).toBe(true);
  for (const animation of [
    null,
    {},
    { start: '1', end: 2, duration: 4 },
    { start: -1, end: 2, duration: 4 },
    { start: 2, end: 2, duration: 4 },
    { start: 1, end: 5, duration: 4 },
    { start: 1, end: 2, duration: Infinity },
  ]) {
    expect(isActionEvent({ ...event, animation })).toBe(false);
  }
});

it('validates retained cursor easing ranges at the persistence boundary', async () => {
  const { isCursorTrack } = await import('./interaction');
  const { normalizeVideoProjectCursorSkin } = await import('../cursor');
  const sample = { id: 'key', time: 0, x: 0, y: 0, visible: true };
  const track = {
    captureMode: 'separate',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [sample],
  };
  expect(isCursorTrack(track)).toBe(true);
  expect(
    isCursorTrack({
      ...track,
      samples: [{ ...sample, interpolationRange: { start: 0.2, end: 0.8 } }],
    })
  ).toBe(true);
  for (const interpolationRange of [
    null,
    {},
    { start: '0', end: 1 },
    { start: -0.1, end: 1 },
    { start: 0.5, end: 0.5 },
    { start: 0, end: 1.01 },
    { start: NaN, end: 1 },
  ]) {
    expect(isCursorTrack({ ...track, samples: [{ ...sample, interpolationRange }] })).toBe(false);
  }
});
