import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoProjectMotionRegion, normalizeVideoProjectMotionRegion } from '../motion';
import { isActionEvent, isMotionRegion } from './interaction';

it('rejects malformed presentation overrides while admitting sparse signed offsets', () => {
  const event = {
    id: 'a',
    anchor: { kind: 'project', time: 0 },
    capturedDuration: 1,
    kind: 'KEY',
    label: 'Ctrl + K',
    data: {},
    point: null,
  };
  expect(isActionEvent({ ...event, presentation: { offset: -0.5, enabled: true } })).toBe(true);
  for (const presentation of [
    null,
    { enabled: 1 },
    { preset: 'unknown' },
    { duration: 0 },
    { duration: -1 },
    { duration: Infinity },
    { offset: NaN },
    { offset: '0' },
    { point: null },
    { point: { x: Infinity, y: 2 } },
  ]) {
    expect(isActionEvent({ ...event, presentation })).toBe(false);
  }
});

it('rejects the removed path model and emits only supported framing fields', () => {
  const project = createEmptyVideoProject('Framing');
  const region = createVideoProjectMotionRegion(project, 0);
  expect(region).not.toHaveProperty('cameraMode');
  expect(region).not.toHaveProperty('path');
  expect(isMotionRegion({ ...region, cameraMode: 'PATH' })).toBe(false);
  expect(isMotionRegion({ ...region, path: { stops: [], segments: [] } })).toBe(false);
  const inactiveMetadata = { ...region, cameraMode: 'STATIC', path: null };
  expect(isMotionRegion(inactiveMetadata)).toBe(true);
  expect(normalizeVideoProjectMotionRegion(project, inactiveMetadata)).toEqual(
    normalizeVideoProjectMotionRegion(project, region)
  );
});

it('admits retained source bindings, including temporarily invisible regions', () => {
  const region = createVideoProjectMotionRegion(createEmptyVideoProject('Bound zoom'), 0);
  const sourceBinding = {
    clipId: 'source',
    sourceStart: 2,
    sourceEnd: 4,
    animation: { start: 0, end: 2, duration: 2 },
  };
  expect(isMotionRegion({ ...region, duration: 0, sourceBinding })).toBe(true);
  expect(isMotionRegion({ ...region, sourceBinding: { ...sourceBinding, sourceEnd: 1 } })).toBe(
    false
  );
});

it('persists the complete framing scale range and rejects invalid scales', () => {
  const region = createVideoProjectMotionRegion(createEmptyVideoProject('Zoom'), 0);
  for (const scale of [0.1, 0.5, 1, 4]) {
    expect(isMotionRegion({ ...region, scale }), `scale ${scale}`).toBe(true);
  }
  for (const scale of [0, -1, 0.09, 4.01, NaN, Infinity, '0.1']) {
    expect(isMotionRegion({ ...region, scale }), `scale ${scale}`).toBe(false);
  }
});

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

it('validates captured duration independently from presentation duration', () => {
  const event = {
    id: 'click',
    kind: 'CLICK',
    anchor: { kind: 'project', time: 2 },
    point: null,
    label: '',
    data: {},
  };
  expect(isActionEvent(event)).toBe(true);
  expect(isActionEvent({ ...event, capturedDuration: 0 })).toBe(true);
  expect(isActionEvent({ ...event, capturedDuration: 4, presentation: { duration: 0.7 } })).toBe(
    true
  );
  for (const capturedDuration of [null, '1', -1, Infinity, NaN]) {
    expect(isActionEvent({ ...event, capturedDuration })).toBe(false);
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

it('admits source facts without a project-time cache and rejects malformed discriminated anchors', () => {
  const fact = {
    id: 'fact',
    kind: 'CLICK',
    label: 'Click',
    data: {},
    point: { x: 0.4, y: 0.5 },
    anchor: {
      kind: 'recording-source',
      recordingId: 'r',
      sourceInstanceId: 'i',
      sourceEventId: 'raw',
      sourceTime: 2,
    },
    capturedDuration: 0.2,
  };
  expect(isActionEvent(fact)).toBe(true);
  expect(isActionEvent({ ...fact, anchor: { kind: 'project', time: 2 } })).toBe(true);
  for (const anchor of [
    null,
    { kind: 'project', time: NaN },
    { ...fact.anchor, sourceInstanceId: '' },
    { ...fact.anchor, sourceEventId: '' },
    { ...fact.anchor, sourceTime: -1 },
  ]) {
    expect(isActionEvent({ ...fact, anchor })).toBe(false);
  }
  expect(isActionEvent({ ...fact, point: { x: 1.1, y: 0.5 } })).toBe(false);
  expect(isActionEvent({ ...fact, presentation: { point: { x: -0.1, y: 0.5 } } })).toBe(false);
});

it('rejects removed authored action timing authorities rather than accepting a mixed contract', () => {
  const event = {
    id: 'a',
    kind: 'CLICK',
    label: 'Click',
    data: {},
    point: null,
    anchor: { kind: 'project', time: 1 },
  };
  for (const removed of [
    { time: 1 },
    { duration: 1 },
    { preset: 'CLICK_RIPPLE' },
    { timeBasis: 'project' },
    { sourceAnchor: null },
    { animation: { start: 0, end: 1, duration: 1 } },
  ]) {
    expect(isActionEvent({ ...event, ...removed })).toBe(false);
  }
});
