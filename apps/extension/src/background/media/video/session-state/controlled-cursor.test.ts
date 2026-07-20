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
  expect(telemetry?.actionEvents).toHaveLength(1);
  expect(telemetry?.viewport).toEqual({
    devicePixelRatio: 2,
    height: 1080,
    scrollX: 4,
    scrollY: 6,
    width: 1920,
  });
}
