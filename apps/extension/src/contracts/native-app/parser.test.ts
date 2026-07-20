import { expect, it } from 'vitest';

import {
  estimateNativeMessageJsonUtf8Bytes,
  isNativeAsciiIdentifier,
  isNativeSafeFilename,
  isNativeTrayActionKind,
  NATIVE_HOST_TO_EXTENSION_MAX_MESSAGE_BYTES,
  NATIVE_MESSAGE_TARGET_MAX_JSON_UTF8_BYTES,
  parseNativeAppInboundMessage,
} from './index';

function createInstallState(kind: 'windows' | 'macos' | 'linux' = 'windows') {
  return {
    appCacheSchemaVersion: 1,
    appVersion: '0.1.0',
    autostart: { enabled: true, method: 'windows-hkcu-run', supported: true },
    installerVersion: '0.1.0',
    nativeHostManifestVersion: '0.1.0',
    packageIntegrity: 'valid',
    platform: { arch: 'x64', kind, version: '11' },
    rollbackProtected: true,
    signedBinary: true,
    updateChannel: 'stable',
  };
}

function createCapabilities() {
  return {
    audio: {
      microphoneDevices: [{ available: true, id: 'default', isDefault: true, label: 'Default' }],
      supportsMicrophone: true,
      supportsMixedAudio: true,
      supportsSystemAudio: true,
      unavailableReasons: [],
    },
    capture: {
      screenshotModes: ['screen', 'active-window', 'all-screens', 'region'],
      supportsFreezeRegionSelection: true,
      videoModes: ['screen', 'active-window', 'region'],
    },
    codecs: {
      audio: ['aac'],
      containers: ['mp4'],
      hardwareEncoderAvailable: true,
      unavailableReasons: [],
      video: ['h264'],
    },
    limits: {
      maxChunkBytes: 524288,
      maxFps: 60,
      maxHeight: 2160,
      maxRecordingBytes: 1024 * 1024 * 1024,
      maxScreenshotBytes: 1024 * 1024,
      maxWidth: 3840,
    },
  };
}

function createHello(kind: 'windows' | 'macos' | 'linux' = 'windows') {
  return {
    appInstanceId: 'app-1',
    capabilities: createCapabilities(),
    install: createInstallState(kind),
    minExtensionVersion: '0.1.0',
    platform: { arch: 'x64', kind, version: '11' },
    protocolVersion: 1,
    settingsSchemaVersion: 1,
    supportedProtocolVersions: [1],
    supportedSettingsSchemaVersions: [1],
    type: 'app.hello',
  };
}

function createRecordingStopped() {
  return {
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    durationMs: 1000,
    filename: 'recording.mp4',
    fps: 30,
    height: 720,
    mimeType: 'video/mp4',
    openEditor: false,
    protocolVersion: 1,
    recordingId: 'recording-1',
    sha256: '0'.repeat(64),
    telemetry: {
      actionEvents: [
        {
          data: { button: 0 },
          duration: 0.1,
          id: 'action-1',
          kind: 'CLICK',
          label: 'Click',
          point: { x: 10, y: 20 },
          preset: 'CLICK_RIPPLE',
          time: 0.1,
        },
      ],
      cursorTrack: null,
      signals: [],
      viewport: null,
    },
    totalBytes: 4,
    type: 'app.recording.stopped',
    width: 1280,
  };
}

function createDeepTelemetryData(depth: number): unknown {
  let value: unknown = 'safe';
  for (let index = 0; index < depth; index += 1) {
    value = { nested: value };
  }
  return value;
}

function createTelemetryPatch(actionEvent: Record<string, unknown>) {
  return {
    ...createRecordingStopped().telemetry,
    actionEvents: [actionEvent],
  };
}

function expectTelemetryRejected(telemetry: unknown): void {
  expect(parseNativeAppInboundMessage({ ...createRecordingStopped(), telemetry })).toMatchObject({
    ok: false,
    reason: 'malformed-message',
  });
}

function createUnsafeTelemetryCases(): unknown[] {
  const click = {
    duration: 0.1,
    kind: 'CLICK',
    point: { x: 1, y: 2 },
    preset: 'CLICK_RIPPLE',
    time: 0.2,
  };
  return [
    createTelemetryPatch({
      ...click,
      data: { text: 'secret typed value' },
      id: 'key-1',
      kind: 'KEY',
      label: 'a',
      preset: 'NONE',
    }),
    createTelemetryPatch({
      ...click,
      data: { targetUrl: 'https://secret.example' },
      id: 'click-1',
      label: 'https://secret.example',
    }),
    createTelemetryPatch({
      ...click,
      data: { button: 0 },
      id: 'https://secret.example/action',
      label: 'Click',
    }),
    {
      ...createRecordingStopped().telemetry,
      signals: [
        {
          data: { dwellMs: 100 },
          endTime: 1,
          id: 'token-signal',
          kind: 'cursor-idle',
          point: null,
          startTime: 0,
        },
      ],
    },
    createTelemetryPatch({
      ...click,
      data: createDeepTelemetryData(12),
      id: 'click-1',
      label: 'Click',
    }),
  ];
}

it('accepts platform-neutral hello messages for supported desktop platforms', () => {
  for (const kind of ['windows', 'macos', 'linux'] as const) {
    expect(parseNativeAppInboundMessage(createHello(kind))).toEqual({
      ok: true,
      value: createHello(kind),
    });
  }
});

it('rejects malformed roots, unsafe ids, and oversized JSON payloads', () => {
  expect(parseNativeAppInboundMessage(null)).toMatchObject({
    ok: false,
    reason: 'malformed-message',
  });

  expect(
    parseNativeAppInboundMessage({ ...createHello(), appInstanceId: '../native-host' })
  ).toMatchObject({
    ok: false,
    reason: 'malformed-message',
  });

  expect(
    parseNativeAppInboundMessage(createHello(), NATIVE_HOST_TO_EXTENSION_MAX_MESSAGE_BYTES + 1)
  ).toMatchObject({
    ok: false,
    reason: 'native-message-too-large',
  });
  expect(
    parseNativeAppInboundMessage(createHello(), NATIVE_MESSAGE_TARGET_MAX_JSON_UTF8_BYTES + 1)
  ).toMatchObject({
    ok: false,
    reason: 'oversized-payload',
  });
});

it('rejects non-negotiated protocol versions before dispatch', () => {
  expect(parseNativeAppInboundMessage({ ...createHello(), protocolVersion: 2 })).toMatchObject({
    ok: false,
    reason: 'malformed-message',
  });
});

it('rejects unsafe native telemetry before persistence', () => {
  expect(parseNativeAppInboundMessage(createRecordingStopped())).toMatchObject({ ok: true });
  for (const telemetry of createUnsafeTelemetryCases()) {
    expectTelemetryRejected(telemetry);
  }
});

it('validates bounded screenshot chunk metadata before ingestion allocates payloads', () => {
  expect(
    parseNativeAppInboundMessage({
      base64: 'AQID',
      captureId: 'capture-1',
      chunkByteOffset: 0,
      chunkIndex: 0,
      chunkRawBytes: 3,
      chunkSha256: '0'.repeat(64),
      controllerLeaseId: 'lease-1',
      protocolVersion: 1,
      type: 'app.screenshot.chunk',
    })
  ).toMatchObject({ ok: true });

  expect(
    parseNativeAppInboundMessage({
      base64: 'not path safe /',
      captureId: 'capture-1',
      chunkByteOffset: 0,
      chunkIndex: 0,
      chunkRawBytes: 3,
      chunkSha256: '0'.repeat(64),
      controllerLeaseId: 'lease-1',
      protocolVersion: 1,
      type: 'app.screenshot.chunk',
    })
  ).toMatchObject({ ok: false, reason: 'malformed-message' });
});

it('exposes native parser helper predicates for route owners', () => {
  expect(estimateNativeMessageJsonUtf8Bytes({ type: 'app.pong' })).toBeGreaterThan(0);
  expect(isNativeAsciiIdentifier('lease-1')).toBe(true);
  expect(isNativeAsciiIdentifier('../lease')).toBe(false);
  expect(isNativeSafeFilename('recording.mp4')).toBe(true);
  expect(isNativeSafeFilename('../recording.mp4')).toBe(false);
  expect(isNativeTrayActionKind('open-settings')).toBe(true);
});
