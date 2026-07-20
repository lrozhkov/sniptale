import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { runtimeNativeAppMessageContracts } from './native-app';

function createStatus() {
  return {
    appStatus: null,
    capabilities: null,
    connectionState: 'connected',
    controllerLease: null,
    effectiveSettings: null,
    error: null,
    hostName: 'com.sniptale.native_host',
    install: {
      appCacheSchemaVersion: 1,
      appVersion: '0.1.0',
      autostart: { enabled: true, method: 'windows-hkcu-run', supported: true },
      installerVersion: '0.1.0',
      nativeHostManifestVersion: '0.1.0',
      packageIntegrity: 'valid',
      platform: { arch: 'x64', kind: 'windows', version: '11' },
      rollbackProtected: true,
      signedBinary: true,
      updateChannel: 'stable',
    },
    lastHeartbeatAt: null,
    platform: { arch: 'x64', kind: 'windows', version: '11' },
    settingsRevision: null,
    trayActions: null,
    warnings: [],
  };
}

it('validates native app runtime status and settings response shapes', () => {
  const response = {
    settings: DEFAULT_VIDEO_SETTINGS.native,
    status: createStatus(),
    success: true,
  };

  expect(
    runtimeNativeAppMessageContracts[MessageType.NATIVE_APP_QUERY].parseResponse(response)
  ).toEqual(response);
});

it('validates native app runtime requests and full status responses', () => {
  expect(
    runtimeNativeAppMessageContracts[MessageType.NATIVE_APP_QUERY].parseRequest({
      requestId: 'query-1',
      type: MessageType.NATIVE_APP_QUERY,
    })
  ).toEqual({ requestId: 'query-1', type: MessageType.NATIVE_APP_QUERY });
  expect(
    runtimeNativeAppMessageContracts[MessageType.NATIVE_APP_MUTATION].parseRequest({
      operation: 'reconnect',
      requestId: 'mutation-1',
      type: MessageType.NATIVE_APP_MUTATION,
    })
  ).toEqual({
    operation: 'reconnect',
    requestId: 'mutation-1',
    type: MessageType.NATIVE_APP_MUTATION,
  });

  expect(
    runtimeNativeAppMessageContracts[MessageType.NATIVE_APP_QUERY].parseResponse({
      settings: DEFAULT_VIDEO_SETTINGS.native,
      status: createFullStatus(),
      success: true,
    })
  ).toEqual(expect.objectContaining({ success: true }));
});

it('rejects malformed native status fields', () => {
  for (const status of [
    { ...createStatus(), warnings: {} },
    { ...createStatus(), capabilities: { capture: {} } },
    { ...createStatus(), controllerLease: createInvalidLeaseStatus() },
    { ...createStatus(), error: { code: 'unknown' } },
    { ...createStatus(), install: { platform: { kind: 'windows' } } },
  ]) {
    expect(() =>
      runtimeNativeAppMessageContracts[MessageType.NATIVE_APP_QUERY].parseResponse({
        status,
        success: true,
      })
    ).toThrow();
  }
});

it('rejects malformed native settings responses', () => {
  expect(() =>
    runtimeNativeAppMessageContracts[MessageType.NATIVE_APP_QUERY].parseResponse({
      status: { ...createStatus(), effectiveSettings: createInvalidEffectiveSettings() },
      success: true,
    })
  ).toThrow();

  expect(() =>
    runtimeNativeAppMessageContracts[MessageType.NATIVE_APP_MUTATION].parseResponse({
      settings: { screenshots: {} },
      success: true,
    })
  ).toThrow();
});

function createInvalidLeaseStatus() {
  return {
    controller: {
      browserFamily: 'chrome',
      connectionId: 'conn-1',
      extensionId: 'extension-id',
      profileKey: 'profile-1',
    },
    controllerLeaseId: 'lease-1',
    expiresAtEpochMs: 1,
    protocolVersion: 1,
    status: 'accepted',
    type: 'app.controller.lease',
  };
}

function createFullStatus() {
  return {
    ...createStatus(),
    appStatus: createFullAppStatus(),
    capabilities: createFullCapabilities(),
    controllerLease: {
      ...createInvalidLeaseStatus(),
      status: 'granted',
    },
    effectiveSettings: { ...DEFAULT_VIDEO_SETTINGS.native, warnings: [] },
    error: { code: 'unknown', recoverable: true },
    lastHeartbeatAt: 1,
    trayActions: {
      actions: [{ enabled: true, id: 'open-settings', kind: 'open-settings', label: 'Open' }],
      revision: 'tray-1',
      shortcutPriority: {
        shortcutLabels: ['Ctrl+S'],
        when: 'browser-active',
        winner: 'extension',
      },
    },
  };
}

function createFullAppStatus() {
  return {
    connectedBrowser: true,
    install: createStatus().install,
    lastError: { code: 'unknown', message: 'Recovered', recoverable: true },
    recording: { durationMs: 10, recordingId: 'recording-1', status: 'recording' },
    settingsRevision: 'settings-1',
  };
}

function createFullCapabilities() {
  return {
    audio: {
      microphoneDevices: [],
      supportsMicrophone: true,
      supportsMixedAudio: true,
      supportsSystemAudio: true,
      unavailableReasons: [],
    },
    capture: {
      screenshotModes: ['screen'],
      supportsFreezeRegionSelection: true,
      videoModes: ['screen'],
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
      maxRecordingBytes: 1024,
      maxScreenshotBytes: 1024,
      maxWidth: 3840,
    },
  };
}

function createInvalidEffectiveSettings() {
  return {
    ...DEFAULT_VIDEO_SETTINGS.native,
    video: {
      ...DEFAULT_VIDEO_SETTINGS.native?.video,
      advanced: {
        ...DEFAULT_VIDEO_SETTINGS.native?.video.advanced,
        videoBitrateMbpsOverride: 120,
      },
    },
    warnings: [],
  };
}
