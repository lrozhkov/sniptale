import { expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoOffscreenEventMessageContracts } from './events';
import { runtimeVideoOffscreenViewportMessageContracts } from './viewport';

const startedContract =
  runtimeVideoOffscreenEventMessageContracts[VideoMessageType.OFFSCREEN_RECORDING_STARTED];
const pausedContract =
  runtimeVideoOffscreenEventMessageContracts[VideoMessageType.OFFSCREEN_RECORDING_PAUSED];
const resumedContract =
  runtimeVideoOffscreenEventMessageContracts[VideoMessageType.OFFSCREEN_RECORDING_RESUMED];
const desktopMediaContract =
  runtimeVideoOffscreenEventMessageContracts[VideoMessageType.GET_DESKTOP_MEDIA];
const desktopMediaFailedContract =
  runtimeVideoOffscreenEventMessageContracts[VideoMessageType.DESKTOP_MEDIA_FAILED];
const errorContract = runtimeVideoOffscreenEventMessageContracts[VideoMessageType.OFFSCREEN_ERROR];
const startRecordingContract =
  runtimeVideoOffscreenViewportMessageContracts[VideoMessageType.OFFSCREEN_START_RECORDING];

const recordingSettings = {
  microphoneEnabled: false,
  microphoneDeviceId: null,
  webcamEnabled: false,
  webcamDeviceId: null,
  systemAudioEnabled: true,
  quality: 'HIGH',
  countdownSeconds: 0,
  autoFadeDelay: 1,
  openEditorAfterRecording: true,
  diagnosticsEnabled: false,
};

it('accepts valid cursor capture modes on offscreen recording started messages', () => {
  expect(
    startedContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
      recordingId: 'rec-1',
      cursorCaptureMode: 'embedded-fallback',
      displaySurface: 'window',
      webcamSettings: { frameRate: 30, height: 720, width: 1280 },
    })
  ).toEqual({
    type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
    recordingId: 'rec-1',
    cursorCaptureMode: 'embedded-fallback',
    displaySurface: 'window',
    webcamSettings: { frameRate: 30, height: 720, width: 1280 },
  });
});

it('rejects invalid webcam track settings on recording started messages', () => {
  expect(() =>
    startedContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
      recordingId: 'rec-1',
      webcamSettings: { width: '1280' },
    })
  ).toThrow(/OFFSCREEN_RECORDING_STARTED/);
});

it('rejects invalid cursor capture mode payloads', () => {
  expect(() =>
    startedContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
      recordingId: 'rec-1',
      cursorCaptureMode: 'unsupported',
    })
  ).toThrow(/OFFSCREEN_RECORDING_STARTED/);
});

it('rejects unknown capture modes on offscreen recording start requests', () => {
  expect(
    startRecordingContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_START_RECORDING,
      capabilityToken: 'test-capability',
      streamId: 'stream-1',
      settings: recordingSettings,
      captureMode: CaptureMode.TAB,
    })
  ).toEqual({
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    capabilityToken: 'test-capability',
    streamId: 'stream-1',
    settings: recordingSettings,
    captureMode: CaptureMode.TAB,
  });

  expect(() =>
    startRecordingContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_START_RECORDING,
      capabilityToken: 'test-capability',
      streamId: 'stream-1',
      settings: recordingSettings,
      captureMode: 'region',
    })
  ).toThrow(/OFFSCREEN_START_RECORDING/);
});

it('requires recording ids on offscreen recording lifecycle messages', () => {
  expect(() =>
    startedContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
    })
  ).toThrow(/OFFSCREEN_RECORDING_STARTED/);
  expect(
    pausedContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
      recordingId: 'rec-1',
    })
  ).toEqual({
    type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
    recordingId: 'rec-1',
  });
  expect(() =>
    resumedContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
    })
  ).toThrow(/OFFSCREEN_RECORDING_RESUMED/);
});

it('rejects invalid display-surface payloads on recording started messages', () => {
  expect(() =>
    startedContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
      recordingId: 'rec-1',
      displaySurface: 'tab',
    })
  ).toThrow(/OFFSCREEN_RECORDING_STARTED/);
});

it('accepts desktop-media messages with optional cursor and source metadata', () => {
  expect(desktopMediaContract.parseResponse(undefined)).toBeUndefined();
  expect(
    desktopMediaContract.parseRequest({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      capabilityToken: 'test-capability',
      captureMode: 'SCREEN',
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
      controlledCursorCaptureEnabled: true,
      desktopLabel: 'Window 2',
      desktopStreamId: 'desktop-2',
      sourceCount: 3,
      sourceIndex: 1,
    })
  ).toEqual({
    type: VideoMessageType.GET_DESKTOP_MEDIA,
    capabilityToken: 'test-capability',
    captureMode: 'SCREEN',
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
    controlledCursorCaptureEnabled: true,
    desktopLabel: 'Window 2',
    desktopStreamId: 'desktop-2',
    sourceCount: 3,
    sourceIndex: 1,
  });
});

it('accepts dispose desktop-media messages', () => {
  const contract =
    runtimeVideoOffscreenEventMessageContracts[VideoMessageType.DISPOSE_DESKTOP_MEDIA];

  expect(
    contract.parseRequest({
      type: VideoMessageType.DISPOSE_DESKTOP_MEDIA,
      capabilityToken: 'test-capability',
    })
  ).toEqual({
    type: VideoMessageType.DISPOSE_DESKTOP_MEDIA,
    capabilityToken: 'test-capability',
  });
  expect(contract.parseResponse(undefined)).toBeUndefined();
});

it('accepts desktop-media acquisition failure messages with source metadata', () => {
  expect(
    desktopMediaFailedContract.parseRequest({
      type: VideoMessageType.DESKTOP_MEDIA_FAILED,
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
      error: 'getUserMedia failed',
      phase: 'desktop-stream-acquire',
      sourceCount: 3,
      sourceIndex: 1,
    })
  ).toEqual({
    type: VideoMessageType.DESKTOP_MEDIA_FAILED,
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
    error: 'getUserMedia failed',
    phase: 'desktop-stream-acquire',
    sourceCount: 3,
    sourceIndex: 1,
  });
  expect(desktopMediaFailedContract.parseResponse(undefined)).toBeUndefined();
});

it('accepts display-media acquisition failure messages with source metadata', () => {
  expect(
    desktopMediaFailedContract.parseRequest({
      type: VideoMessageType.DESKTOP_MEDIA_FAILED,
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
      error: 'getDisplayMedia failed',
      phase: 'display-media-acquire',
      sourceCount: 3,
      sourceIndex: 1,
    })
  ).toEqual({
    type: VideoMessageType.DESKTOP_MEDIA_FAILED,
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
    error: 'getDisplayMedia failed',
    phase: 'display-media-acquire',
    sourceCount: 3,
    sourceIndex: 1,
  });
});

it('rejects invalid desktop-media acquisition failure phases', () => {
  expect(() =>
    desktopMediaFailedContract.parseRequest({
      type: VideoMessageType.DESKTOP_MEDIA_FAILED,
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
      error: 'getUserMedia failed',
      phase: 'runtime',
    })
  ).toThrow(/DESKTOP_MEDIA_FAILED/);
});

it('rejects malformed controlled cursor flags on desktop-media requests', () => {
  expect(() =>
    desktopMediaContract.parseRequest({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      captureMode: 'region',
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
    })
  ).toThrow(/GET_DESKTOP_MEDIA/);
  expect(() =>
    desktopMediaContract.parseRequest({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      captureMode: 'SCREEN',
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
      controlledCursorCaptureEnabled: 'yes',
    })
  ).toThrow(/GET_DESKTOP_MEDIA/);
});

it('validates offscreen error phases', () => {
  expect(
    errorContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_ERROR,
      error: 'boom',
      offscreenStartupId: 'startup-1',
      phase: 'runtime',
      recordingId: 'rec-1',
    })
  ).toEqual({
    type: VideoMessageType.OFFSCREEN_ERROR,
    error: 'boom',
    offscreenStartupId: 'startup-1',
    phase: 'runtime',
    recordingId: 'rec-1',
  });
  expect(() =>
    errorContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_ERROR,
      error: 'boom',
      phase: 'unknown',
    })
  ).toThrow(/OFFSCREEN_ERROR/);
});
