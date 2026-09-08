import { expect, it } from 'vitest';

import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  type RecordingActionEvent,
  type VideoProjectCursorTrack,
} from '../../../features/video/project/types/interaction';
import { CaptureMode, type ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import {
  normalizeRecordingActionEventsToProjectSpace,
  normalizeRecordingCursorTrackToProjectSpace,
} from './telemetry';

function createViewportInfo(): ViewportInfo {
  return {
    devicePixelRatio: 1,
    height: 900,
    outerHeight: 1040,
    outerWidth: 1600,
    scrollX: 0,
    scrollY: 0,
    viewportOffsetX: 8,
    viewportOffsetY: 132,
    width: 1584,
  };
}

function createCursorTrack(): VideoProjectCursorTrack {
  return {
    captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
    skin: {
      animationPreset: VideoCursorAnimationPreset.NONE,
      color: '#ffffff',
      hidden: true,
      preset: VideoCursorVisualPreset.ARROW,
      scale: 1,
      shadow: true,
    },
    samples: [{ id: 'sample-1', time: 1, visible: true, x: 100, y: 200 }],
  };
}

function createActionEvents(): RecordingActionEvent[] {
  return [
    {
      data: { button: 0 },
      duration: 0.45,
      id: 'action-1',
      kind: 'CLICK',
      label: 'Click',
      point: { x: 100, y: 200 },
      preset: 'CLICK_RIPPLE',
      time: 1,
    },
  ];
}

it('keeps unproven actions nonspatial while cursor coordinates retain project units', () => {
  const params = {
    captureMode: CaptureMode.SCREEN,
    displaySurface: 'window' as const,
    projectHeight: 1300,
    projectWidth: 2000,
    viewport: createViewportInfo(),
  };

  expect(normalizeRecordingCursorTrackToProjectSpace(createCursorTrack(), params)).toEqual(
    expect.objectContaining({
      samples: [expect.objectContaining({ x: 135, y: 415 })],
    })
  );
  expect(normalizeRecordingActionEventsToProjectSpace(createActionEvents(), params)).toEqual([
    expect.objectContaining({ point: null }),
  ]);
});

it('leaves tab telemetry in viewport space scaling without screen chrome offsets', () => {
  const params = {
    captureMode: CaptureMode.TAB,
    displaySurface: null,
    projectHeight: 1800,
    projectWidth: 3200,
    viewport: createViewportInfo(),
  };

  expect(normalizeRecordingCursorTrackToProjectSpace(createCursorTrack(), params)).toEqual(
    expect.objectContaining({
      samples: [expect.objectContaining({ x: 202.02020202020202, y: 400 })],
    })
  );
});

it('keeps screen-selected browser tabs in viewport space without window chrome offsets', () => {
  const params = {
    captureMode: CaptureMode.SCREEN,
    displaySurface: 'browser' as const,
    projectHeight: 1800,
    projectWidth: 3200,
    viewport: createViewportInfo(),
  };

  expect(normalizeRecordingCursorTrackToProjectSpace(createCursorTrack(), params)).toEqual(
    expect.objectContaining({
      samples: [expect.objectContaining({ x: 202.02020202020202, y: 400 })],
    })
  );
});

it('keeps captured facts when geometry is unavailable and refuses to clamp out-of-source points', () => {
  const events = createActionEvents();
  const original = structuredClone(events);
  const params = {
    captureMode: CaptureMode.TAB,
    displaySurface: null,
    projectHeight: 900,
    projectWidth: 1584,
    viewport: createViewportInfo(),
  };
  for (const patch of [{ viewport: null }, { captureMode: CaptureMode.TAB_CROP }]) {
    expect(normalizeRecordingActionEventsToProjectSpace(events, { ...params, ...patch })).toEqual([
      { ...events[0], point: null },
    ]);
  }
  expect(
    normalizeRecordingActionEventsToProjectSpace(
      [{ ...events[0]!, point: { x: -1, y: 20 } }],
      params
    )[0]?.point
  ).toBeNull();
  expect(events).toEqual(original);
});

it.each([CaptureMode.TAB, CaptureMode.TAB_CROP])(
  'imports immutable recordingPoint for %s without reconstructing from final viewport',
  (captureMode) => {
    const events = [{ ...createActionEvents()[0]!, recordingPoint: { x: 0.25, y: 0.75 } }];
    const original = structuredClone(events);
    for (const viewport of [null, createViewportInfo(), { ...createViewportInfo(), width: 500 }]) {
      const result = normalizeRecordingActionEventsToProjectSpace(events, {
        captureMode,
        displaySurface: null,
        projectWidth: 1920,
        projectHeight: 1080,
        viewport,
      });
      expect(result[0]?.point).toEqual({ x: 0.25, y: 0.75 });
      expect(result[0]?.id).toBe(events[0]!.id);
      expect(result[0]?.time).toBe(events[0]!.time);
    }
    expect(events).toEqual(original);
  }
);

it('keeps TAB history nonspatial when recordingPoint is absent or explicitly unavailable', () => {
  const raw = createActionEvents()[0]!;
  const events = [raw, { ...raw, id: 'unavailable', recordingPoint: null }];
  const result = normalizeRecordingActionEventsToProjectSpace(events, {
    captureMode: CaptureMode.TAB,
    displaySurface: null,
    projectWidth: 1584,
    projectHeight: 900,
    viewport: createViewportInfo(),
  });
  expect(result.map((event) => ({ id: event.id, point: event.point }))).toEqual([
    { id: raw.id, point: null },
    { id: 'unavailable', point: null },
  ]);
});
