import { expect, it } from 'vitest';

import { CaptureMode, VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import {
  RecordingTelemetrySignalKind,
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
} from '../../../features/video/project/types/interaction';
import { mapNativeRecordingTelemetry } from './telemetry';

it('normalizes native telemetry monotonic timestamps relative to the recording timebase', () => {
  const telemetry = mapNativeRecordingTelemetry({
    createdAt: 10,
    recordingId: 'recording-1',
    sourceMode: 'active-window',
    telemetry: {
      actionEvents: [createActionEvent(1_050)],
      cursorTrack: createCursorTrack(1_075),
      signals: [createSignal(1_100, 1_140)],
      viewport: createViewport(),
    },
    timebase: {
      id: 'timebase-1',
      startedAtEpochMs: 1,
      startedAtMonotonicNs: '1000',
      units: 'milliseconds',
    },
    updatedAt: 20,
  });

  expect(telemetry).toEqual(
    expect.objectContaining({
      captureMode: CaptureMode.SCREEN,
      displaySurface: VideoDisplaySurface.WINDOW,
    })
  );
  expect(telemetry?.actionEvents[0]?.time).toBe(50);
  expect(telemetry?.cursorTrack?.samples[0]?.time).toBe(75);
  expect(telemetry?.signals[0]).toEqual(expect.objectContaining({ endTime: 140, startTime: 100 }));
});

it('keeps telemetry unchanged without a valid timebase and returns null for missing telemetry', () => {
  expect(
    mapNativeRecordingTelemetry({
      createdAt: 10,
      recordingId: 'recording-1',
      sourceMode: 'region',
      telemetry: null,
      updatedAt: 20,
    })
  ).toBeNull();

  expect(
    mapNativeRecordingTelemetry({
      createdAt: 10,
      recordingId: 'recording-2',
      sourceMode: 'screen',
      telemetry: {
        actionEvents: [],
        cursorTrack: null,
        signals: [createSignal(-1, 1)],
        viewport: null,
      },
      timebase: {
        id: 'timebase-2',
        startedAtEpochMs: 1,
        startedAtMonotonicNs: 'not-a-number',
        units: 'milliseconds',
      },
      updatedAt: 20,
    })
  ).toEqual(expect.objectContaining({ signals: [expect.objectContaining({ startTime: -1 })] }));
});

function createActionEvent(time: number) {
  return {
    data: {},
    duration: 100,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CALLOUT,
    label: 'Click',
    point: { x: 1, y: 2 },
    preset: VideoProjectActionPreset.NONE,
    time,
  };
}

function createCursorTrack(time: number) {
  return {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [{ id: 'sample-1', time, visible: true, x: 3, y: 4 }],
    skin: {
      animationPreset: VideoCursorAnimationPreset.NONE,
      color: '#ffffff',
      hidden: false,
      preset: VideoCursorVisualPreset.ARROW,
      scale: 1,
      shadow: false,
    },
  };
}

function createSignal(startTime: number, endTime: number) {
  return {
    data: {},
    endTime,
    id: 'signal-1',
    kind: RecordingTelemetrySignalKind.TYPING,
    point: null,
    startTime,
  };
}

function createViewport() {
  return {
    devicePixelRatio: 1,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
  };
}
