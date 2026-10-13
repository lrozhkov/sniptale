import { beforeEach, expect, it } from 'vitest';
import {
  VideoCursorAnimationPreset,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoCursorVisualPreset,
  type VideoProjectCursorTrack,
} from '../../../../features/video/project/types';

import {
  appendControlledCursorTelemetry,
  mergeTelemetrySnapshots,
  beginControlledCursorNavigation,
  clearControlledCursorNavigationPending,
  getControlledCursorDisplaySurface,
  getControlledCursorNavigationEpoch,
  getControlledCursorOffsetSeconds,
  getControlledCursorTelemetry,
  getControlledCursorVerifiedMode,
  isControlledCursorAutoPaused,
  isControlledCursorCaptureEnabled,
  isControlledCursorNavigationPending,
  resetControlledCursorCaptureState,
  setControlledCursorAutoPaused,
  setControlledCursorCaptureEnabled,
  setControlledCursorDisplaySurface,
  setControlledCursorNavigationPending,
  setControlledCursorOffsetSeconds,
  setControlledCursorVerifiedMode,
  setRecordingFrameClock,
  getRecordingFrameClock,
} from './controlled-cursor';

beforeEach(() => {
  resetControlledCursorCaptureState();
});

function createCursorTrackSample(id: string, time: number, x: number, y: number) {
  return { id, time, visible: true, x, y };
}

function createCursorTrack(color: string, scale: number, shadow: boolean): VideoProjectCursorTrack {
  return {
    captureMode: 'separate' as const,
    samples: [createCursorTrackSample('sample-1', 0.2, 10, 20)],
    skin: {
      animationPreset: VideoCursorAnimationPreset.NONE,
      color,
      hidden: false,
      preset: VideoCursorVisualPreset.ARROW,
      scale,
      shadow,
    },
  };
}

function createViewport(devicePixelRatio: number, width: number, height: number) {
  return {
    devicePixelRatio,
    height,
    scrollX: devicePixelRatio * 2,
    scrollY: devicePixelRatio * 3,
    width,
  };
}

it('tracks the controlled cursor lifecycle flags through the session owner', () => {
  setControlledCursorCaptureEnabled(true);
  setControlledCursorAutoPaused(true);
  setControlledCursorNavigationPending(true);
  setControlledCursorOffsetSeconds(3.5);
  setControlledCursorDisplaySurface('window');
  setControlledCursorVerifiedMode('embedded-fallback');

  expect(isControlledCursorCaptureEnabled()).toBe(true);
  expect(isControlledCursorAutoPaused()).toBe(true);
  expect(isControlledCursorNavigationPending()).toBe(true);
  expect(getControlledCursorOffsetSeconds()).toBe(3.5);
  expect(getControlledCursorDisplaySurface()).toBe('window');
  expect(getControlledCursorVerifiedMode()).toBe('embedded-fallback');
});

it('guards controlled cursor pending clears by navigation epoch', () => {
  const initialEpoch = getControlledCursorNavigationEpoch();
  const firstEpoch = beginControlledCursorNavigation();
  const secondEpoch = beginControlledCursorNavigation();

  expect(firstEpoch).toBe(initialEpoch + 1);
  expect(secondEpoch).toBe(initialEpoch + 2);
  expect(getControlledCursorNavigationEpoch()).toBe(initialEpoch + 2);
  expect(isControlledCursorNavigationPending()).toBe(true);

  expect(clearControlledCursorNavigationPending(firstEpoch)).toBe(false);
  expect(isControlledCursorNavigationPending()).toBe(true);

  expect(clearControlledCursorNavigationPending(secondEpoch)).toBe(true);
  expect(isControlledCursorNavigationPending()).toBe(false);
});

it('clears the verified cursor mode when the session state resets', () => {
  beginControlledCursorNavigation();
  const activeEpoch = getControlledCursorNavigationEpoch();
  setControlledCursorVerifiedMode('separate');

  expect(getControlledCursorVerifiedMode()).toBe('separate');

  resetControlledCursorCaptureState();

  expect(getControlledCursorNavigationEpoch()).toBe(activeEpoch);
  expect(getControlledCursorDisplaySurface()).toBeNull();
  expect(getControlledCursorVerifiedMode()).toBeNull();
});

it(
  'merges telemetry snapshots across navigation epochs without exposing mutable state',
  verifyMergedTelemetrySnapshots
);

it('handles empty telemetry snapshots and exposes null until the first real payload arrives', () => {
  expect(getControlledCursorTelemetry()).toBeNull();

  appendControlledCursorTelemetry(null);
  appendControlledCursorTelemetry({
    actionEvents: [],
    cursorTrack: createCursorTrack('#fff', 1, true),
    signals: [],
    viewport: null,
  });
  appendControlledCursorTelemetry({
    actionEvents: [],
    cursorTrack: null,
    signals: [],
    viewport: null,
  });

  expect(getControlledCursorTelemetry()?.cursorTrack?.samples).toHaveLength(1);
});

function verifyMergedTelemetrySnapshots() {
  appendFirstTelemetrySnapshot();
  appendSecondTelemetrySnapshot();

  const telemetry = getControlledCursorTelemetry();

  expectMergedTelemetry(telemetry);
  telemetry?.cursorTrack?.samples.push({
    id: 'mutated',
    time: 9,
    visible: true,
    x: 1,
    y: 1,
  });
  expect(getControlledCursorTelemetry()?.cursorTrack?.samples).toHaveLength(2);
}

function appendFirstTelemetrySnapshot() {
  appendControlledCursorTelemetry({
    actionEvents: [],
    cursorTrack: createCursorTrack('#fff', 1, true),
    signals: [],
    viewport: createViewport(1, 1280, 720),
  });
}

function appendSecondTelemetrySnapshot() {
  appendControlledCursorTelemetry({
    actionEvents: [
      {
        id: 'action-1',
        kind: VideoProjectActionEventKind.CLICK,
        time: 1.5,
        duration: 0.45,
        point: { x: 20, y: 30 },
        label: 'Click',
        data: { button: 0 },
        preset: VideoProjectActionPreset.CLICK_RIPPLE,
      },
    ],
    cursorTrack: {
      ...createCursorTrack('#000', 1.2, false),
      samples: [createCursorTrackSample('sample-2', 1.4, 25, 35)],
    },
    signals: [],
    viewport: createViewport(2, 1920, 1080),
  });
}

function expectMergedTelemetry(telemetry: ReturnType<typeof getControlledCursorTelemetry>) {
  expect(telemetry?.cursorTrack?.samples).toHaveLength(2);
  expect(telemetry?.cursorTrack?.skin).toEqual({
    animationPreset: VideoCursorAnimationPreset.NONE,
    color: '#000',
    hidden: false,
    preset: VideoCursorVisualPreset.ARROW,
    scale: 1.2,
    shadow: false,
  });
  expect(telemetry?.actionEvents).toEqual([
    {
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      time: 1.5,
      duration: 0.45,
      point: { x: 20, y: 30 },
      label: 'Click',
      data: { button: 0 },
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
    },
  ]);
  expect(telemetry?.viewport).toEqual({
    devicePixelRatio: 2,
    height: 1080,
    scrollX: 4,
    scrollY: 6,
    width: 1920,
  });
}

it('preserves same-geometry navigation proof and never recovers after a changed segment', () => {
  const initial = {
    width: 1000,
    height: 800,
    devicePixelRatio: 1,
    visualViewportScale: 1,
    visualViewportOffsetX: 0,
    visualViewportOffsetY: 0,
  };
  const segment = {
    viewport: createViewport(1, 1000, 800),
    cursorTrack: null,
    actionEvents: [],
    signals: [],
    viewportObservation: { initial, stable: true },
  };
  appendControlledCursorTelemetry(segment);
  beginControlledCursorNavigation();
  appendControlledCursorTelemetry(structuredClone(segment));
  expect(getControlledCursorTelemetry()).toMatchObject({
    viewportObservation: { initial, stable: true },
  });
  appendControlledCursorTelemetry({
    ...segment,
    viewportObservation: { initial: { ...initial, width: 1200 }, stable: true },
  });
  appendControlledCursorTelemetry(segment);
  expect(getControlledCursorTelemetry()).toMatchObject({
    viewportObservation: { initial, stable: false },
  });
});

it('retains detached source metadata, cadence and projected geometry through snapshot lifecycle', () => {
  const snapshot = {
    viewport: null,
    viewportObservation: null,
    provenance: {
      source: 'browser' as const,
      normalizationVersion: 1 as const,
      timeUnit: 'seconds' as const,
      coordinateSpace: 'client-css' as const,
    },
    capabilities: {
      version: 1 as const,
      pointer: 'available' as const,
      keyboard: 'available' as const,
      wheel: 'available' as const,
      coverage: 'document' as const,
    },
    cursorTrack: createCursorTrack('#fff', 1, true),
    actionEvents: [],
    signals: [
      {
        id: 'keyboard',
        kind: 'typing' as const,
        startTime: 1,
        endTime: 1.1,
        point: null,
        recordingPoint: { x: 0.2, y: 0.3 },
        data: {},
        keyboardRhythm: [
          {
            version: 1 as const,
            id: 'block',
            startTime: 1,
            quantumMs: 1 as const,
            count: 2,
            encoding: 'delta' as const,
            ticks: [0, 100],
          },
        ],
      },
    ],
  };
  appendControlledCursorTelemetry(snapshot);
  const first = getControlledCursorTelemetry();
  expect(first?.provenance).toEqual(snapshot.provenance);
  expect(first?.capabilities).toEqual(snapshot.capabilities);
  snapshot.signals[0]!.keyboardRhythm[0]!.ticks[1] = 999;
  snapshot.signals[0]!.recordingPoint.x = 0.9;
  expect(first?.signals[0]?.keyboardRhythm?.[0]?.ticks).toEqual([0, 100]);
  expect(first?.signals[0]?.recordingPoint).toEqual({ x: 0.2, y: 0.3 });
  first!.signals[0]!.keyboardRhythm![0]!.ticks[1] = 999;
  expect(getControlledCursorTelemetry()?.signals[0]?.keyboardRhythm?.[0]?.ticks).toEqual([0, 100]);
});

it('keeps unknown legacy observation support unknown when merging with a capable browser document', () => {
  const legacy = { viewport: null, cursorTrack: null, actionEvents: [], signals: [] };
  const browser = {
    ...legacy,
    capabilities: {
      version: 1 as const,
      pointer: 'available' as const,
      keyboard: 'available' as const,
      wheel: 'available' as const,
      coverage: 'document' as const,
    },
  };
  expect(mergeTelemetrySnapshots(legacy, browser).capabilities).toEqual({
    version: 1,
    pointer: 'unknown',
    keyboard: 'unknown',
    wheel: 'unknown',
    coverage: 'unknown',
  });
});
it('keeps source-clock revision and identity authority isolated from caller mutations', () => {
  expect(getRecordingFrameClock()).toBeNull();
  const first = {
    recordingId: 'recording',
    streamInstanceId: 'native',
    generation: 2,
    revision: 1,
    phase: 'active' as const,
    captureEpochMs: 1000,
    mediaTimeSeconds: 0,
  };
  expect(setRecordingFrameClock(first)).toBe(true);
  first.mediaTimeSeconds = 99;
  const returned = getRecordingFrameClock()!;
  expect(returned.mediaTimeSeconds).toBe(0);
  Reflect.set(returned, 'mediaTimeSeconds', 88);
  expect(getRecordingFrameClock()!.mediaTimeSeconds).toBe(0);
  expect(setRecordingFrameClock({ ...first, revision: 1 })).toBe(false);
  expect(setRecordingFrameClock({ ...first, revision: 2, streamInstanceId: 'other' })).toBe(false);
  expect(setRecordingFrameClock({ ...first, revision: 2, generation: 3 })).toBe(false);
  expect(setRecordingFrameClock({ ...first, revision: 2, mediaTimeSeconds: 1 })).toBe(true);
  expect(getRecordingFrameClock()!.revision).toBe(2);
  resetControlledCursorCaptureState();
  expect(getRecordingFrameClock()).toBeNull();
});
