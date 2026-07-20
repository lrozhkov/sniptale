import type {
  AppRecordingChunkMessage,
  AppRecordingStartedMessage,
  AppRecordingStoppedMessage,
  AppScreenshotChunkMessage,
  AppScreenshotCommitMessage,
  AppScreenshotStartMessage,
} from '../../../contracts/native-app';

const SHA256 = '0'.repeat(64);

export function createScreenshotStart(captureId: string): AppScreenshotStartMessage {
  return {
    capturedAtEpochMs: 1,
    captureId,
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    filename: 'capture.png',
    height: 720,
    mimeType: 'image/png',
    mode: 'screen',
    openEditor: false,
    protocolVersion: 1,
    sha256: SHA256,
    totalBytes: 1,
    type: 'app.screenshot.start',
    width: 1280,
  };
}

export function createScreenshotChunk(captureId: string): AppScreenshotChunkMessage {
  return {
    base64: 'YQ==',
    captureId,
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: 1,
    chunkSha256: SHA256,
    controllerLeaseId: 'lease-1',
    protocolVersion: 1,
    type: 'app.screenshot.chunk',
  };
}

export function createScreenshotCommit(captureId: string): AppScreenshotCommitMessage {
  return {
    captureId,
    controllerLeaseId: 'lease-1',
    protocolVersion: 1,
    type: 'app.screenshot.commit',
  };
}

export function createRecordingStarted(recordingId: string): AppRecordingStartedMessage {
  return {
    controllerLeaseId: 'lease-1',
    effectiveQuality: {
      audioBitrateKbps: 160,
      audioSourceMode: 'mixed',
      effectiveAudioBitrateKbps: 160,
      effectiveFps: 30,
      effectiveVideoBitrateMbps: 12,
      encoder: 'hardware',
      frameRate: 30,
      quality: 'HIGH',
      videoBitrateMbpsOverride: null,
      warnings: [],
    },
    protocolVersion: 1,
    recordingId,
    requestedQuality: {
      audioBitrateKbps: 160,
      audioSourceMode: 'mixed',
      frameRate: 30,
      quality: 'HIGH',
      videoBitrateMbpsOverride: null,
    },
    requestedSettingsRevision: 'settings-1',
    source: { mode: 'screen' },
    startedAtEpochMs: 1,
    timebase: {
      id: 'timebase-1',
      startedAtEpochMs: 1,
      startedAtMonotonicNs: '1000',
      units: 'milliseconds',
    },
    type: 'app.recording.started',
  };
}

export function createRecordingChunk(recordingId: string): AppRecordingChunkMessage {
  return {
    base64: 'YQ==',
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: 1,
    chunkSha256: SHA256,
    controllerLeaseId: 'lease-1',
    protocolVersion: 1,
    recordingId,
    type: 'app.recording.chunk',
  };
}

export function createRecordingStopped(recordingId: string): AppRecordingStoppedMessage {
  return {
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    durationMs: 500,
    filename: 'recording.mp4',
    fps: 30,
    height: 720,
    mimeType: 'video/mp4',
    openEditor: false,
    protocolVersion: 1,
    recordingId,
    sha256: SHA256,
    telemetry: null,
    totalBytes: 1,
    type: 'app.recording.stopped',
    width: 1280,
  };
}
