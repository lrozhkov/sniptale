import { expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

import {
  isVideoExportCapabilities,
  isRecordingStateHealth,
  isRecordingTelemetrySnapshot,
  isSize2d,
  isVideoRecordingRuntimeState,
  isVideoRecordingSettings,
  isVideoViewportPresetSelection,
  isViewportInfo,
  isViewportRegion,
} from './validators';

function createTypingSignal() {
  return {
    data: { eventCount: 2, eventType: 'input' },
    endTime: 0.9,
    id: 'signal-1',
    kind: 'typing',
    point: null,
    startTime: 0.2,
  } as const;
}

function createTelemetrySnapshot() {
  return {
    actionEvents: [
      {
        data: { button: 0 },
        duration: 0.4,
        id: 'action-1',
        kind: 'CLICK',
        label: 'Click',
        point: { x: 10, y: 20 },
        preset: 'CLICK_RIPPLE',
        time: 0.1,
      },
    ],
    cursorTrack: {
      captureMode: 'separate',
      samples: [{ id: 'sample-1', time: 0.1, visible: true, x: 10, y: 20 }],
      skin: {
        animationPreset: 'NONE',
        color: '#fff',
        hidden: false,
        preset: 'ARROW',
        scale: 1,
        shadow: true,
      },
    },
    signals: [createTypingSignal()],
    viewport: {
      devicePixelRatio: 2,
      height: 720,
      outerHeight: 860,
      outerWidth: 1300,
      scrollX: 0,
      scrollY: 100,
      viewportOffsetX: 10,
      viewportOffsetY: 30,
      width: 1280,
    },
  } as const;
}

it('accepts valid size payloads and rejects malformed size payloads', () => {
  expect(isSize2d({ height: 200, width: 100 })).toBe(true);
  expect(isSize2d({ height: '200', width: 100 })).toBe(false);
  expect(isSize2d(null)).toBe(false);
});

it('accepts valid viewport regions and rejects malformed viewport regions', () => {
  expect(isViewportRegion({ height: 200, width: 100, x: 10, y: 20 })).toBe(true);
  expect(isViewportRegion({ height: 200, width: 100, x: '10', y: 20 })).toBe(false);
  expect(isViewportRegion({ height: 200, width: 100, x: 10 })).toBe(false);
});

it('accepts valid viewport info payloads and rejects malformed viewport info', () => {
  expect(
    isViewportInfo({
      devicePixelRatio: 2,
      height: 1080,
      outerHeight: 1120,
      outerWidth: 1940,
      scrollX: 10,
      scrollY: 20,
      viewportOffsetX: 8,
      viewportOffsetY: 40,
      width: 1920,
    })
  ).toBe(true);
  expect(
    isViewportInfo({
      devicePixelRatio: '2',
      height: 1080,
      scrollX: 10,
      scrollY: 20,
      width: 1920,
    })
  ).toBe(false);
});

it('accepts controlled cursor capture settings with microphone processing settings', () => {
  expect(
    isVideoRecordingSettings({
      autoFadeDelay: 300,
      controlledCursorCaptureEnabled: true,
      countdownSeconds: 3,
      diagnosticsEnabled: true,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      microphoneGain: 1.25,
      microphoneDeviceId: null,
      microphoneEnabled: true,
      openEditorAfterRecording: false,
      quality: '1080p',
      sourceCount: 2,
      systemAudioEnabled: true,
      webcamDeviceId: 'cam-1',
      webcamEnabled: true,
    })
  ).toBe(true);
});

it('rejects invalid video recording settings flag and source count values', () => {
  expect(
    isVideoRecordingSettings({
      autoFadeDelay: 300,
      controlledCursorCaptureEnabled: 'yes',
      countdownSeconds: 3,
      diagnosticsEnabled: true,
      microphoneDeviceId: null,
      microphoneEnabled: true,
      openEditorAfterRecording: false,
      quality: '1080p',
      systemAudioEnabled: true,
      webcamDeviceId: null,
      webcamEnabled: false,
    })
  ).toBe(false);
  expect(
    isVideoRecordingSettings({
      autoFadeDelay: 300,
      countdownSeconds: 3,
      diagnosticsEnabled: true,
      microphoneDeviceId: null,
      microphoneEnabled: true,
      openEditorAfterRecording: false,
      quality: '1080p',
      sourceCount: '2',
      systemAudioEnabled: true,
      webcamDeviceId: null,
      webcamEnabled: false,
    })
  ).toBe(false);
});

it('accepts viewport presets with and without optional labels', () => {
  expect(
    isVideoViewportPresetSelection({
      height: 720,
      id: 'preset-1',
      label: 'HD',
      width: 1280,
    })
  ).toBe(true);
  expect(isVideoViewportPresetSelection({ height: 720, width: 1280 })).toBe(true);
  expect(isVideoViewportPresetSelection({ height: 720, id: 1, width: 1280 })).toBe(false);
});

it('validates telemetry snapshots with cursor and action sidecars', () => {
  expect(isRecordingTelemetrySnapshot(createTelemetrySnapshot())).toBe(true);
  expect(isViewportInfo(createTelemetrySnapshot().viewport)).toBe(true);
  expect(
    isRecordingTelemetrySnapshot({
      ...createTelemetrySnapshot(),
      actionEvents: [{ data: null, duration: 1, id: 'bad', kind: 'CLICK', label: 'Bad' }],
      signals: [
        { data: null, endTime: 1, id: 'bad-signal', kind: 'typing', point: null, startTime: 0 },
      ],
      viewport: null,
    })
  ).toBe(false);
});

it('rejects telemetry snapshots with malformed cursor samples', () => {
  expect(
    isRecordingTelemetrySnapshot({
      ...createTelemetrySnapshot(),
      actionEvents: [],
      cursorTrack: {
        ...createTelemetrySnapshot().cursorTrack,
        samples: [{ id: 'sample-1', time: 0.1, visible: true, x: '10', y: 20 }],
      },
      signals: [
        {
          data: { dwellMs: 1200 },
          endTime: 1.2,
          id: 'signal-1',
          kind: 'cursor-idle',
          point: { x: '10', y: 20 },
          startTime: 0.2,
        },
      ],
      viewport: null,
    })
  ).toBe(false);
});

it('accepts runtime state snapshots with nullable capture fields', () => {
  expect(
    isVideoRecordingRuntimeState({
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 456,
      error: null,
      status: 'idle',
      viewportPreset: null,
    })
  ).toBe(true);
});

it('validates runtime state capture source variants', () => {
  const state = {
    captureMode: CaptureMode.TAB,
    captureSource: { mode: 'tab', streamId: 'stream-1' },
    countdownEndsAt: 123,
    duration: 456,
    error: null,
    status: 'recording',
    viewportPreset: { height: 720, id: 'preset-1', label: 'HD', width: 1280 },
  };

  expect(isVideoRecordingRuntimeState(state)).toBe(true);
  expect(isVideoRecordingRuntimeState({ ...state, captureMode: 'region' })).toBe(false);
  expect(
    isVideoRecordingRuntimeState({
      ...state,
      captureMode: null,
      captureSource: { mode: 'tab', streamId: 42 },
    })
  ).toBe(false);
  expect(
    isVideoRecordingRuntimeState({
      ...state,
      captureSource: { ...state.captureSource, streamCapabilityToken: 'secret-token' },
    })
  ).toBe(false);
});

it('validates recording health discriminants', () => {
  expect(isRecordingStateHealth('healthy')).toBe(true);
  expect(isRecordingStateHealth('broken')).toBe(false);
});

it('validates export capability payloads with optional codec reasons', () => {
  expect(
    isVideoExportCapabilities({
      formats: [{ format: 'mp4', available: true }],
      mp4Codecs: [
        { codec: 'AVC', available: true },
        { codec: 'HEVC', available: false, reason: 'CODEC_UNSUPPORTED' },
      ],
      defaultMp4VideoCodec: 'AVC',
    })
  ).toBe(true);

  expect(
    isVideoExportCapabilities({
      formats: [{ format: 'mp4', available: 'yes' }],
      mp4Codecs: [{ codec: 'AVC', available: true }],
      defaultMp4VideoCodec: null,
    })
  ).toBe(false);
});
