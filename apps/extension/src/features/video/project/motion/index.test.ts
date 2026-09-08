import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { hydrateVideoProject } from '../hydration';
import { createVideoProjectMotionRegion, normalizeVideoProjectMotionRegion } from './index';
import { createMotionFocusAreaFromPointScale } from './index';
import { resolveMotionScale } from './normalization';

it('accepts positive zoom-out scales without admitting zero or invalid values', () => {
  expect(resolveMotionScale(0.1)).toBe(0.1);
  expect(resolveMotionScale(0.5)).toBe(0.5);
  expect(resolveMotionScale(0)).toBe(0.1);
  expect(resolveMotionScale(-1)).toBe(0.1);
  expect(resolveMotionScale(Infinity)).toBe(1);
  expect(resolveMotionScale(NaN)).toBe(1);
  expect(resolveMotionScale(5)).toBe(4);
});
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../types/index';

it('preserves authored framing connections through hydration and rejects malformed settings', () => {
  const project = createEmptyVideoProject();
  project.duration = 8;
  const first = { ...createVideoProjectMotionRegion(project, 0), id: 'first', duration: 2 };
  const second = {
    ...createVideoProjectMotionRegion(project, 4),
    id: 'second',
    duration: 2,
    incomingConnection: { fromRegionId: first.id, easing: VideoTemporalEasing.LINEAR },
  };
  project.motionRegions = [first, second];
  const hydrated = hydrateVideoProject(structuredClone(project));
  expect(hydrated.motionRegions?.[1]?.incomingConnection).toEqual(second.incomingConnection);
  for (const invalid of [
    null,
    12,
    {},
    { fromRegionId: 12, easing: 'LINEAR' },
    { fromRegionId: '', easing: 'LINEAR' },
    { fromRegionId: 'first', easing: 'unknown' },
  ]) {
    expect(
      normalizeVideoProjectMotionRegion(project, {
        ...second,
        incomingConnection: invalid as never,
      }).incomingConnection
    ).toBeUndefined();
  }
});

it('creates a default motion region centered on the project', () => {
  const project = createEmptyVideoProject('Motion', 1920, 1080);
  const region = createVideoProjectMotionRegion(project, -2);

  expect(region).toEqual(
    expect.objectContaining({
      duration: 2.8,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 960, y: 540 },
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,

      scale: 1.35,
      startTime: 0,
      targetAction: null,
    })
  );
});

function createMotionNormalizationProject() {
  const project = createEmptyVideoProject('Motion', 800, 600);
  project.duration = 5;
  project.actionEvents = [
    {
      data: {},
      capturedDuration: 0.5,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Action',
      point: { x: 100, y: 200 },
      presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
      anchor: { kind: 'project', time: 1 },
    },
  ];
  return project;
}

it('normalizes invalid motion region bounds, focus, and overlay zoom mode', () => {
  const project = createMotionNormalizationProject();
  const region = normalizeVideoProjectMotionRegion(project, {
    duration: Number.POSITIVE_INFINITY,
    easing: 'bad' as never,
    focusMode: 'bad' as never,
    focusPoint: { x: -100, y: 9999 },
    id: 'motion-1',
    motionBlurAmount: Number.POSITIVE_INFINITY,
    overlayZoomMode: 'bad' as never,
    scale: 9,
    startTime: 10,
    targetAction: { eventId: 'missing', clipId: null },
    zoomInDuration: Number.NaN,
    zoomOutDuration: 99,
  });

  expect(region).toEqual({
    duration: 0.1,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusArea: null,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 0, y: 600 },
    id: 'motion-1',
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,

    scale: 4,
    startTime: 4.9,
    targetAction: null,
    zoomInDuration: 0,
    zoomOutDuration: 0.1,
  });
});

it('keeps valid target action ownership and overlay zoom mode during normalization', () => {
  const project = createMotionNormalizationProject();
  const region = normalizeVideoProjectMotionRegion(project, {
    ...createVideoProjectMotionRegion(project, 0.5),
    targetAction: { eventId: 'action-1', clipId: null },
  });

  expect(
    normalizeVideoProjectMotionRegion(project, {
      ...region,
      focusMode: VideoMotionFocusMode.ACTION,
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      targetAction: { eventId: 'action-1', clipId: null },
    })
  ).toEqual(
    expect.objectContaining({
      overlayZoomMode: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      targetAction: { eventId: 'action-1', clipId: null },
    })
  );
});

it('creates and normalizes manual focus areas inside the project bounds', () => {
  const project = createEmptyVideoProject('Motion area', 800, 600);

  expect(createMotionFocusAreaFromPointScale(project, { x: 760, y: 570 }, 2)).toEqual({
    height: 300,
    width: 400,
    x: 400,
    y: 300,
  });
  expect(createMotionFocusAreaFromPointScale(project, { x: 50, y: 40 }, 20)).toEqual({
    height: 150,
    width: 200,
    x: 0,
    y: 0,
  });

  expect(
    normalizeVideoProjectMotionRegion(project, {
      ...createVideoProjectMotionRegion(project, 1),
      focusArea: { x: -50, y: 900, width: 900, height: 20 },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
    })
  ).toEqual(
    expect.objectContaining({
      focusArea: {
        height: 48,
        width: 800,
        x: 0,
        y: 552,
      },
      focusMode: VideoMotionFocusMode.MANUAL_AREA,
    })
  );
});
