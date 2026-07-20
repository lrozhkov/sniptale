import { expect, it } from 'vitest';

import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  type VideoProjectActionEvent,
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

function createActionEvents(): VideoProjectActionEvent[] {
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

it('normalizes screen telemetry into recorded project coordinates including browser chrome offsets', () => {
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
    expect.objectContaining({ point: { x: 135, y: 415 } }),
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
