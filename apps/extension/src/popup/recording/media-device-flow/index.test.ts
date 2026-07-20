import { expect, it, vi } from 'vitest';

import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { refreshPopupMediaDevices, togglePopupMediaDevice } from '.';
import type { PopupMediaDeviceOption } from '../media-devices';

type Deferred<TValue> = {
  promise: Promise<TValue>;
  reject: (reason?: unknown) => void;
  resolve: (value: TValue) => void;
};

function createDeferred<TValue>(): Deferred<TValue> {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

function createDevice(deviceId: string): PopupMediaDeviceOption {
  return { deviceId, label: deviceId };
}

function createSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 3,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
    webcamDeviceId: 'cam-1',
    webcamEnabled: false,
  };
}

it('ignores stale refresh results when a newer same-owner refresh has already applied', async () => {
  const refreshOwner = Symbol('same-owner-refresh');
  const firstRefresh = createDeferred<PopupMediaDeviceOption[]>();
  const secondRefresh = createDeferred<PopupMediaDeviceOption[]>();
  const setIsLoading = vi.fn();
  const setDevices = vi.fn();
  const loadDevices = vi
    .fn()
    .mockReturnValueOnce(firstRefresh.promise)
    .mockReturnValueOnce(secondRefresh.promise);

  const firstPromise = refreshPopupMediaDevices({
    refreshOwner,
    setIsLoading,
    setDevices,
    currentDevices: [createDevice('initial')],
    loadDevices,
    onError: vi.fn(),
  });
  const secondPromise = refreshPopupMediaDevices({
    refreshOwner,
    setIsLoading,
    setDevices,
    currentDevices: [createDevice('initial')],
    loadDevices,
    onError: vi.fn(),
  });

  secondRefresh.resolve([createDevice('new')]);
  await expect(secondPromise).resolves.toEqual([createDevice('new')]);
  firstRefresh.resolve([createDevice('old')]);
  await expect(firstPromise).resolves.toEqual([]);

  expect(setDevices).toHaveBeenCalledOnce();
  expect(setDevices).toHaveBeenCalledWith([createDevice('new')]);
  expect(setIsLoading.mock.calls.map(([value]) => value)).toEqual([true, true, false]);
});

it('logs current refresh failures and clears the matching device list', async () => {
  const refreshOwner = Symbol('current-owner-refresh-failure');
  const setIsLoading = vi.fn();
  const setDevices = vi.fn();
  const onError = vi.fn();
  const error = new Error('load failed');

  await expect(
    refreshPopupMediaDevices({
      refreshOwner,
      setIsLoading,
      setDevices,
      currentDevices: [createDevice('initial')],
      loadDevices: vi.fn().mockRejectedValue(error),
      onError,
    })
  ).resolves.toEqual([]);

  expect(onError).toHaveBeenCalledWith(error);
  expect(setDevices).toHaveBeenCalledWith([]);
  expect(setIsLoading.mock.calls.map(([value]) => value)).toEqual([true, false]);
});

it('does not let stale failures clear devices or loading state from a newer refresh', async () => {
  const refreshOwner = Symbol('same-owner-refresh-failure');
  const firstRefresh = createDeferred<PopupMediaDeviceOption[]>();
  const secondRefresh = createDeferred<PopupMediaDeviceOption[]>();
  const setIsLoading = vi.fn();
  const setDevices = vi.fn();
  const onError = vi.fn();
  const loadDevices = vi
    .fn()
    .mockReturnValueOnce(firstRefresh.promise)
    .mockReturnValueOnce(secondRefresh.promise);

  const firstPromise = refreshPopupMediaDevices({
    refreshOwner,
    setIsLoading,
    setDevices,
    currentDevices: [],
    loadDevices,
    onError,
  });
  const secondPromise = refreshPopupMediaDevices({
    refreshOwner,
    setIsLoading,
    setDevices,
    currentDevices: [],
    loadDevices,
    onError,
  });

  secondRefresh.resolve([createDevice('new')]);
  await secondPromise;
  firstRefresh.reject(new Error('old failure'));
  await expect(firstPromise).resolves.toEqual([]);

  expect(onError).not.toHaveBeenCalled();
  expect(setDevices).toHaveBeenCalledOnce();
  expect(setDevices).toHaveBeenCalledWith([createDevice('new')]);
  expect(setIsLoading.mock.calls.map(([value]) => value)).toEqual([true, true, false]);
});

it('keeps microphone and webcam refresh owners independent', async () => {
  const microphoneOwner = Symbol('microphone-refresh');
  const webcamOwner = Symbol('webcam-refresh');
  const microphoneRefresh = createDeferred<PopupMediaDeviceOption[]>();
  const webcamRefresh = createDeferred<PopupMediaDeviceOption[]>();
  const setMicrophoneDevices = vi.fn();
  const setWebcamDevices = vi.fn();

  const microphonePromise = refreshPopupMediaDevices({
    refreshOwner: microphoneOwner,
    setIsLoading: vi.fn(),
    setDevices: setMicrophoneDevices,
    currentDevices: [],
    loadDevices: vi.fn().mockReturnValue(microphoneRefresh.promise),
    onError: vi.fn(),
  });
  const webcamPromise = refreshPopupMediaDevices({
    refreshOwner: webcamOwner,
    setIsLoading: vi.fn(),
    setDevices: setWebcamDevices,
    currentDevices: [],
    loadDevices: vi.fn().mockReturnValue(webcamRefresh.promise),
    onError: vi.fn(),
  });

  webcamRefresh.resolve([createDevice('cam-1')]);
  await webcamPromise;
  microphoneRefresh.resolve([createDevice('mic-1')]);
  await microphonePromise;

  expect(setWebcamDevices).toHaveBeenCalledWith([createDevice('cam-1')]);
  expect(setMicrophoneDevices).toHaveBeenCalledWith([createDevice('mic-1')]);
});

it('disables an enabled media setting without refreshing devices', async () => {
  const setVideoSettings = vi.fn();
  const refreshDevices = vi.fn();

  await togglePopupMediaDevice({
    videoSettings: { ...createSettings(), webcamEnabled: true },
    setVideoSettings,
    setStartError: vi.fn(),
    refreshDevices,
    enabledKey: 'webcamEnabled',
    deviceIdKey: 'webcamDeviceId',
    noDevicesError: 'no devices',
    accessError: 'access denied',
    resolveDeviceId: vi.fn(),
  });

  const applySettings = setVideoSettings.mock.calls[0]?.[0] as (
    settings: VideoRecordingSettings
  ) => VideoRecordingSettings;
  expect(applySettings({ ...createSettings(), webcamEnabled: true })).toEqual(
    expect.objectContaining({ webcamEnabled: false, webcamDeviceId: 'cam-1' })
  );
  expect(refreshDevices).not.toHaveBeenCalled();
});

it('enables media capture with the resolved refreshed device id', async () => {
  const setVideoSettings = vi.fn();
  const resolveDeviceId = vi.fn().mockReturnValue('cam-2');
  const devices = [createDevice('cam-2')];

  await togglePopupMediaDevice({
    videoSettings: createSettings(),
    setVideoSettings,
    setStartError: vi.fn(),
    refreshDevices: vi.fn().mockResolvedValue(devices),
    enabledKey: 'webcamEnabled',
    deviceIdKey: 'webcamDeviceId',
    noDevicesError: 'no devices',
    accessError: 'access denied',
    resolveDeviceId,
  });

  const applySettings = setVideoSettings.mock.calls[0]?.[0] as (
    settings: VideoRecordingSettings
  ) => VideoRecordingSettings;
  expect(applySettings(createSettings())).toEqual(
    expect.objectContaining({ webcamEnabled: true, webcamDeviceId: 'cam-2' })
  );
  expect(resolveDeviceId).toHaveBeenCalledWith('cam-1', devices);
});

it('surfaces empty and failed refreshes without changing settings', async () => {
  const setStartError = vi.fn();
  const setVideoSettings = vi.fn();

  await togglePopupMediaDevice({
    videoSettings: createSettings(),
    setVideoSettings,
    setStartError,
    refreshDevices: vi.fn().mockResolvedValue([]),
    enabledKey: 'webcamEnabled',
    deviceIdKey: 'webcamDeviceId',
    noDevicesError: 'no devices',
    accessError: 'access denied',
    resolveDeviceId: vi.fn(),
  });
  await togglePopupMediaDevice({
    videoSettings: createSettings(),
    setVideoSettings,
    setStartError,
    refreshDevices: vi.fn().mockRejectedValue(new Error('permission denied')),
    enabledKey: 'webcamEnabled',
    deviceIdKey: 'webcamDeviceId',
    noDevicesError: 'no devices',
    accessError: 'access denied',
    resolveDeviceId: vi.fn(),
  });

  expect(setStartError).toHaveBeenCalledWith('no devices');
  expect(setStartError).toHaveBeenCalledWith('permission denied');
  expect(setVideoSettings).not.toHaveBeenCalled();
});
