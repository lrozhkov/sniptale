import { expect, it } from 'vitest';

import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { parseNativeAppInboundMessage } from './index';

it('accepts native control and transfer messages routed by type', () => {
  for (const message of createControlMessages()) {
    expect(parseNativeAppInboundMessage(message)).toMatchObject({ ok: true });
  }
  for (const message of createTransferMessages()) {
    expect(parseNativeAppInboundMessage(message)).toMatchObject({ ok: true });
  }
});

it('rejects recording start messages with incomplete quality settings', () => {
  const message = createRecordingStarted();

  expect(
    parseNativeAppInboundMessage({
      ...message,
      requestedQuality: {},
      effectiveQuality: { warnings: [] },
    })
  ).toMatchObject({ ok: false });
  expect(
    parseNativeAppInboundMessage({
      ...message,
      effectiveQuality: { ...message.effectiveQuality, effectiveVideoBitrateMbps: 0 },
    })
  ).toMatchObject({ ok: false });
});

function createControlMessages() {
  return [
    {
      actionId: 'open-settings',
      controllerLeaseId: 'lease-1',
      invocationId: 'invoke-1',
      protocolVersion: 2,
      requestedAtEpochMs: 1,
      type: 'app.tray.actionRequested',
    },
    {
      controllerLeaseId: 'lease-1',
      invocationId: 'open-1',
      protocolVersion: 2,
      requestedAtEpochMs: 1,
      section: 'native-app',
      type: 'app.openSettings.requested',
    },
    {
      acceptedAtEpochMs: 1,
      commandId: 'screenshot-1',
      controllerLeaseId: 'lease-1',
      operation: 'screenshot',
      protocolVersion: 2,
      type: 'app.command.accepted',
    },
  ];
}

function createTransferMessages() {
  return [
    createScreenshotStart(),
    createScreenshotCommit(),
    createRecordingStarted(),
    createRecordingProgress(),
    createRecordingStopped(),
    createRecordingChunk(),
    createOperationFailed(),
  ];
}

function createScreenshotStart() {
  return {
    capturedAtEpochMs: 1,
    captureId: 'capture-1',
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    filename: 'capture.png',
    height: 20,
    mimeType: 'image/png',
    mode: 'screen',
    openEditor: true,
    protocolVersion: 2,
    sha256: '0'.repeat(64),
    totalBytes: 3,
    type: 'app.screenshot.start',
    width: 30,
  };
}

function createScreenshotCommit() {
  return {
    captureId: 'capture-1',
    controllerLeaseId: 'lease-1',
    protocolVersion: 2,
    type: 'app.screenshot.commit',
  };
}

function createRecordingStarted() {
  const requestedQuality = {
    audioBitrateKbps: 160,
    audioSourceMode: 'mixed',
    frameRate: 30,
    quality: VideoQuality.HIGH,
    videoBitrateMbpsOverride: null,
  };
  return {
    controllerLeaseId: 'lease-1',
    effectiveQuality: {
      ...requestedQuality,
      effectiveAudioBitrateKbps: 160,
      effectiveFps: 30,
      effectiveVideoBitrateMbps: 12,
      encoder: 'hardware',
      warnings: [],
    },
    protocolVersion: 2,
    recordingId: 'recording-1',
    requestedQuality,
    requestedSettingsRevision: 'settings-1',
    source: { mode: 'screen', region: { height: 10, width: 10, x: 0, y: 0 } },
    startedAtEpochMs: 1,
    timebase: {
      id: 'timebase-1',
      startedAtEpochMs: 1,
      startedAtMonotonicNs: '1',
      units: 'milliseconds',
    },
    type: 'app.recording.started',
  };
}

function createRecordingProgress() {
  return {
    bytesWritten: 3,
    controllerLeaseId: 'lease-1',
    durationMs: 10,
    protocolVersion: 2,
    recordingId: 'recording-1',
    status: 'recording',
    type: 'app.recording.progress',
  };
}

function createRecordingStopped() {
  return {
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    durationMs: 10,
    filename: 'recording.mp4',
    fps: 30,
    height: 720,
    mimeType: 'video/mp4',
    openEditor: false,
    protocolVersion: 2,
    recordingId: 'recording-1',
    sha256: '0'.repeat(64),
    telemetry: { actionEvents: [], cursorTrack: null, signals: [], viewport: null },
    totalBytes: 3,
    type: 'app.recording.stopped',
    width: 1280,
  };
}

function createRecordingChunk() {
  return {
    base64: 'AQID',
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: 3,
    chunkSha256: '0'.repeat(64),
    controllerLeaseId: 'lease-1',
    protocolVersion: 2,
    recordingId: 'recording-1',
    type: 'app.recording.chunk',
  };
}

function createOperationFailed() {
  return {
    controllerLeaseId: 'lease-1',
    error: { code: 'unknown', recoverable: true },
    occurredAtEpochMs: 1,
    operation: 'screenshot',
    phase: 'capture',
    protocolVersion: 2,
    type: 'app.operation.failed',
  };
}

it('accepts signed desktop region origins on monitors left or above the primary display', () => {
  for (const [x, y] of [
    [-1920, -1080],
    [-2147483648, 2147483647],
  ]) {
    const message = {
      ...createRecordingStarted(),
      source: { mode: 'region', region: { x, y, width: 1280, height: 720 } },
    };
    expect(parseNativeAppInboundMessage(message)).toMatchObject({ ok: true });
  }
});

it('rejects nonintegral or out-of-range desktop region origins and invalid extents', () => {
  const base = { x: -1920, y: -1080, width: 1280, height: 720 };
  for (const region of [
    { ...base, x: -2147483649 },
    { ...base, y: 2147483648 },
    { ...base, x: -0.5 },
    { ...base, y: Number.NaN },
    { ...base, width: 0 },
    { ...base, height: -1 },
  ]) {
    expect(
      parseNativeAppInboundMessage({
        ...createRecordingStarted(),
        source: { mode: 'region', region },
      })
    ).toMatchObject({ ok: false });
  }
});
