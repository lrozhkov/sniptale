import { beforeEach, expect, it, vi } from 'vitest';

import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { refreshPopupMediaDevices, togglePopupMediaDevice } from '.';
import type { PopupMediaDeviceOption } from '../media-devices';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  loadPopupMediaDevices,
  requestPopupMediaDevicePermission,
  resolvePopupMediaDeviceId,
} from '../media-devices';
import { loadWebcamDevices, requestWebcamPermission, resolveWebcamDeviceId } from '../webcam';
import {
  loadMicrophoneDevices,
  requestMicrophonePermission,
  resolveMicrophoneDeviceId,
} from '../microphone';

const { readAccessStateMock, openSettingsPageMock } = vi.hoisted(() => ({
  readAccessStateMock: vi.fn(),
  openSettingsPageMock: vi.fn(),
}));

vi.mock('../media-devices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-devices')>()),
  readPopupMediaAccessState: readAccessStateMock,
}));

vi.mock('../../../platform/navigation/extension-pages', () => ({
  openSettingsPage: openSettingsPageMock,
}));

beforeEach(() => {
  readAccessStateMock.mockReset().mockResolvedValue('granted');
  openSettingsPageMock.mockReset().mockResolvedValue(undefined);
});

it.each([
  { enabledKey: 'microphoneEnabled', deviceIdKey: 'microphoneDeviceId', kind: 'microphone' },
  { enabledKey: 'webcamEnabled', deviceIdKey: 'webcamDeviceId', kind: 'camera' },
] as const)(
  'hands off non-granted $kind access without acquiring devices or changing settings',
  async ({ enabledKey, deviceIdKey, kind }) => {
    const settings = createSettings();
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();
    const requestPermission = vi.fn();
    const refreshDevices = vi.fn();
    for (const state of ['prompt', 'denied', 'unknown'] as const) {
      readAccessStateMock.mockResolvedValueOnce(state);
      await togglePopupMediaDevice({
        videoSettings: settings,
        setVideoSettings,
        setStartError,
        requestPermission,
        refreshDevices,
        enabledKey,
        deviceIdKey,
        noDevicesError: 'no devices',
        accessErrorKey: 'popup.video.microphoneAccessError',
        resolveDeviceId: resolvePopupMediaDeviceId,
      });
      expect(readAccessStateMock).toHaveBeenLastCalledWith(kind);
      expect(openSettingsPageMock).toHaveBeenLastCalledWith({
        route: { section: 'access-data', view: 'permissions' },
        requestMediaAccess: kind,
      });
    }
    expect(openSettingsPageMock).toHaveBeenCalledTimes(3);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(refreshDevices).not.toHaveBeenCalled();
    expect(setVideoSettings).not.toHaveBeenCalled();
    expect(setStartError.mock.calls).toEqual([[null], [null], [null]]);
    expect(settings).toEqual(createSettings());
  }
);

it.each([
  { enabledKey: 'microphoneEnabled', deviceIdKey: 'microphoneDeviceId' },
  { enabledKey: 'webcamEnabled', deviceIdKey: 'webcamDeviceId' },
] as const)(
  'keeps a failed $enabledKey navigation retryable without acquiring or changing the saved device',
  async ({ enabledKey, deviceIdKey }) => {
    readAccessStateMock.mockResolvedValue('prompt');
    openSettingsPageMock.mockRejectedValueOnce(new Error('tab unavailable'));
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();
    const requestPermission = vi.fn();
    const params = {
      videoSettings: createSettings(),
      setVideoSettings,
      setStartError,
      requestPermission,
      refreshDevices: vi.fn(),
      enabledKey,
      deviceIdKey,
      noDevicesError: 'no devices',
      accessErrorKey: 'popup.video.microphoneAccessError' as const,
      resolveDeviceId: resolvePopupMediaDeviceId,
    };
    await togglePopupMediaDevice(params);
    expect(setStartError).toHaveBeenLastCalledWith(expect.stringContaining('Sniptale'));
    expect(setStartError).not.toHaveBeenCalledWith(expect.stringContaining('tab unavailable'));
    await togglePopupMediaDevice(params);
    expect(openSettingsPageMock).toHaveBeenCalledTimes(2);
    expect(setStartError).toHaveBeenLastCalledWith(null);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(setVideoSettings).not.toHaveBeenCalled();
  }
);

it('opens one targeted Settings handoff for repeated clicks while navigation is pending', async () => {
  readAccessStateMock.mockResolvedValue('prompt');
  const navigation = createDeferred<void>();
  openSettingsPageMock.mockReturnValueOnce(navigation.promise);
  const params = {
    videoSettings: createSettings(),
    setVideoSettings: vi.fn(),
    setStartError: vi.fn(),
    requestPermission: vi.fn(),
    refreshDevices: vi.fn(),
    enabledKey: 'microphoneEnabled' as const,
    deviceIdKey: 'microphoneDeviceId' as const,
    noDevicesError: 'no devices',
    accessErrorKey: 'popup.video.microphoneAccessError' as const,
    resolveDeviceId: resolvePopupMediaDeviceId,
  };
  const firstClick = togglePopupMediaDevice(params);
  await vi.waitFor(() => expect(openSettingsPageMock).toHaveBeenCalledOnce());
  await togglePopupMediaDevice(params);
  expect(openSettingsPageMock).toHaveBeenCalledOnce();
  navigation.resolve();
  await firstClick;
  await togglePopupMediaDevice(params);
  expect(openSettingsPageMock).toHaveBeenCalledTimes(2);
  expect(params.setVideoSettings).not.toHaveBeenCalled();
  expect(params.requestPermission).not.toHaveBeenCalled();
});

it.each(['granted', 'denied'] as const)(
  'verifies a replacement microphone after the saved device disappears: %s',
  async (replacementAccess) => {
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();
    const stop = vi.fn();
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      if (
        typeof constraints.audio === 'object' &&
        constraints.audio.deviceId &&
        typeof constraints.audio.deviceId === 'object' &&
        'exact' in constraints.audio.deviceId &&
        constraints.audio.deviceId.exact === 'mic-1'
      ) {
        throw new DOMException('Missing selected microphone', 'OverconstrainedError');
      }
      if (replacementAccess === 'denied') {
        throw new DOMException('Refused replacement microphone', 'NotAllowedError');
      }
      return { getTracks: () => [{ stop }] };
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi
          .fn()
          .mockResolvedValue([
            { kind: 'audioinput', deviceId: 'mic-2', label: 'Replacement microphone' },
          ]),
        getUserMedia,
      },
    });
    try {
      await togglePopupMediaDevice({
        videoSettings: createSettings(),
        setVideoSettings,
        setStartError,
        requestPermission: requestMicrophonePermission,
        refreshDevices: () => loadMicrophoneDevices({ hydrateLabels: 'always' }),
        enabledKey: 'microphoneEnabled',
        deviceIdKey: 'microphoneDeviceId',
        noDevicesError: 'no devices',
        accessErrorKey: 'popup.video.microphoneAccessError',
        resolveDeviceId: resolveMicrophoneDeviceId,
      });
      expect(getUserMedia.mock.calls.map(([constraints]) => constraints)).toEqual([
        { audio: { deviceId: { exact: 'mic-1' } } },
        { audio: { deviceId: { exact: 'mic-2' } } },
      ]);
      if (replacementAccess === 'granted') {
        expect(stop).toHaveBeenCalledOnce();
        const applySettings = setVideoSettings.mock.calls[0]?.[0] as (
          previous: VideoRecordingSettings
        ) => VideoRecordingSettings;
        expect(applySettings(createSettings())).toMatchObject({
          microphoneEnabled: true,
          microphoneDeviceId: 'mic-2',
        });
        expect(setStartError).toHaveBeenCalledExactlyOnceWith(null);
      } else {
        expect(stop).not.toHaveBeenCalled();
        expect(setVideoSettings).not.toHaveBeenCalled();
        expect(setStartError).toHaveBeenLastCalledWith(
          expect.stringMatching(/microphone|микрофон/i)
        );
      }
    } finally {
      vi.unstubAllGlobals();
    }
  }
);

it.each(['granted', 'denied'] as const)(
  'verifies a replacement camera after the saved device disappears: %s',
  async (replacementAccess) => {
    const setVideoSettings = vi.fn();
    const setStartError = vi.fn();
    const stop = vi.fn();
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      if (
        typeof constraints.video === 'object' &&
        constraints.video.deviceId &&
        typeof constraints.video.deviceId === 'object' &&
        'exact' in constraints.video.deviceId &&
        constraints.video.deviceId.exact === 'cam-1'
      ) {
        throw new DOMException('Missing selected camera', 'OverconstrainedError');
      }
      if (replacementAccess === 'denied') {
        throw new DOMException('Refused replacement camera', 'NotAllowedError');
      }
      return { getTracks: () => [{ stop }] };
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi
          .fn()
          .mockResolvedValue([
            { kind: 'videoinput', deviceId: 'cam-2', label: 'Replacement camera' },
          ]),
        getUserMedia,
      },
    });
    try {
      await togglePopupMediaDevice({
        videoSettings: createSettings(),
        setVideoSettings,
        setStartError,
        requestPermission: (deviceId: string | null = 'cam-1') => requestWebcamPermission(deviceId),
        refreshDevices: () => loadWebcamDevices({ hydrateLabels: 'always' }),
        enabledKey: 'webcamEnabled',
        deviceIdKey: 'webcamDeviceId',
        noDevicesError: 'no devices',
        accessErrorKey: 'popup.video.webcamAccessError',
        resolveDeviceId: resolveWebcamDeviceId,
      });
      expect(getUserMedia.mock.calls.map(([constraints]) => constraints)).toEqual([
        { video: { deviceId: { exact: 'cam-1' } }, audio: false },
        { video: { deviceId: { exact: 'cam-2' } }, audio: false },
      ]);
      if (replacementAccess === 'granted') {
        expect(stop).toHaveBeenCalledOnce();
        const applySettings = setVideoSettings.mock.calls[0]?.[0] as (
          previous: VideoRecordingSettings
        ) => VideoRecordingSettings;
        expect(applySettings(createSettings())).toMatchObject({
          webcamEnabled: true,
          webcamDeviceId: 'cam-2',
        });
        expect(setStartError).toHaveBeenCalledExactlyOnceWith(null);
      } else {
        expect(stop).not.toHaveBeenCalled();
        expect(setVideoSettings).not.toHaveBeenCalled();
        expect(setStartError).toHaveBeenLastCalledWith(expect.stringMatching(/camera|камер/i));
      }
    } finally {
      vi.unstubAllGlobals();
    }
  }
);

it.each([{ devices: [] }, { devices: [createDevice('cam-1')] }])(
  'preserves settings when missing-device recovery has no replacement: $devices',
  async ({ devices }) => {
    const setVideoSettings = vi.fn();
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException('Missing selected camera', 'NotFoundError'));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    try {
      await togglePopupMediaDevice({
        videoSettings: createSettings(),
        setVideoSettings,
        setStartError: vi.fn(),
        requestPermission: requestWebcamPermission,
        refreshDevices: vi.fn().mockResolvedValue(devices),
        enabledKey: 'webcamEnabled',
        deviceIdKey: 'webcamDeviceId',
        noDevicesError: 'no devices',
        accessErrorKey: 'popup.video.webcamAccessError',
        resolveDeviceId: resolvePopupMediaDeviceId,
      });
      expect(getUserMedia).toHaveBeenCalledOnce();
      expect(setVideoSettings).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  }
);

it.each(['NotAllowedError', 'NotReadableError'])(
  'does not replace a selected camera after %s',
  async (errorName) => {
    const setVideoSettings = vi.fn();
    const refreshDevices = vi.fn();
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException('Unavailable selected camera', errorName));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    try {
      await togglePopupMediaDevice({
        videoSettings: createSettings(),
        setVideoSettings,
        setStartError: vi.fn(),
        requestPermission: (deviceId: string | null = 'cam-1') => requestWebcamPermission(deviceId),
        refreshDevices,
        enabledKey: 'webcamEnabled',
        deviceIdKey: 'webcamDeviceId',
        noDevicesError: 'no devices',
        accessErrorKey: 'popup.video.webcamAccessError',
        resolveDeviceId: resolvePopupMediaDeviceId,
      });
      expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({
        video: { deviceId: { exact: 'cam-1' } },
        audio: false,
      });
      expect(refreshDevices).not.toHaveBeenCalled();
      expect(setVideoSettings).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  }
);

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
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 3,
    countdownSeconds: 0,
    interactionDiagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: false,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.HIGH },
    systemAudioEnabled: true,
    webcamDeviceId: 'cam-1',
    webcamEnabled: false,
  };
}

it('does not enable capture from an enumerated placeholder when permission is refused', async () => {
  const setVideoSettings = vi.fn();
  const config = {
    kind: 'videoinput' as const,
    permissionName: 'camera' as const,
    fallbackLabelKey: 'popup.video.webcamToggleLabel' as const,
    createConstraints: () => ({ video: true, audio: false }),
  };
  vi.stubGlobal('navigator', {
    mediaDevices: {
      enumerateDevices: vi
        .fn()
        .mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1', label: '' }]),
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('Refused', 'NotAllowedError')),
    },
  });
  try {
    await togglePopupMediaDevice({
      videoSettings: createSettings(),
      setVideoSettings,
      setStartError: vi.fn(),
      requestPermission: () => requestPopupMediaDevicePermission(config, 'cam-1'),
      refreshDevices: () => loadPopupMediaDevices(config, { hydrateLabels: 'always' }),
      enabledKey: 'webcamEnabled',
      deviceIdKey: 'webcamDeviceId',
      noDevicesError: 'no devices',
      accessErrorKey: 'popup.video.webcamAccessError',
      resolveDeviceId: (currentId) => currentId,
    });
    expect(setVideoSettings).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

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
    requestPermission: vi.fn(),
    deviceIdKey: 'webcamDeviceId',
    noDevicesError: 'no devices',
    accessErrorKey: 'popup.video.webcamAccessError',
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
    requestPermission: vi.fn().mockResolvedValue(undefined),
    enabledKey: 'webcamEnabled',
    deviceIdKey: 'webcamDeviceId',
    noDevicesError: 'no devices',
    accessErrorKey: 'popup.video.webcamAccessError',
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
    requestPermission: vi.fn().mockResolvedValue(undefined),
    enabledKey: 'webcamEnabled',
    deviceIdKey: 'webcamDeviceId',
    noDevicesError: 'no devices',
    accessErrorKey: 'popup.video.webcamAccessError',
    resolveDeviceId: vi.fn(),
  });
  await togglePopupMediaDevice({
    videoSettings: createSettings(),
    setVideoSettings,
    setStartError,
    refreshDevices: vi.fn().mockRejectedValue(new Error('permission denied')),
    requestPermission: vi.fn().mockResolvedValue(undefined),
    enabledKey: 'webcamEnabled',
    deviceIdKey: 'webcamDeviceId',
    noDevicesError: 'no devices',
    accessErrorKey: 'popup.video.webcamAccessError',
    resolveDeviceId: vi.fn(),
  });

  expect(setStartError).toHaveBeenCalledWith('no devices');
  expect(setStartError).toHaveBeenCalledWith(expect.stringContaining('Sniptale'));
  expect(setVideoSettings).not.toHaveBeenCalled();
});
