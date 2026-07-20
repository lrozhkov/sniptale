// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { MicrophoneOption } from '../../recording/microphone';
import type { WebcamOption } from '../../recording/webcam';
import { usePopupMediaDeviceEffects } from './media-device-effects';

const { resolveMicrophoneDeviceIdMock, resolveWebcamDeviceIdMock } = vi.hoisted(() => ({
  resolveMicrophoneDeviceIdMock: vi.fn((deviceId: string | null) => deviceId),
  resolveWebcamDeviceIdMock: vi.fn((deviceId: string | null) => deviceId),
}));

vi.mock('../../recording/microphone', (_importOriginal) => ({
  resolveMicrophoneDeviceId: resolveMicrophoneDeviceIdMock,
}));

vi.mock('../../recording/webcam', (_importOriginal) => ({
  resolveWebcamDeviceId: resolveWebcamDeviceIdMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'mic-1',
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    quality: VideoQuality.MEDIUM,
    systemAudioEnabled: true,
    webcamDeviceId: 'cam-1',
    webcamEnabled: true,
  };
}

function EffectsHarness({
  refreshMicrophones,
  refreshWebcams,
  setVideoSettings,
}: {
  refreshMicrophones: () => Promise<MicrophoneOption[]>;
  refreshWebcams: () => Promise<WebcamOption[]>;
  setVideoSettings: React.Dispatch<React.SetStateAction<VideoRecordingSettings>>;
}) {
  usePopupMediaDeviceEffects({
    microphoneDevices: [{ deviceId: 'mic-2', label: 'Mic 2' }],
    refreshMicrophones,
    refreshWebcams,
    setVideoSettings,
    webcamDevices: [{ deviceId: 'cam-2', label: 'Camera 2' }],
  });
  return null;
}

async function renderHarness(props: React.ComponentProps<typeof EffectsHarness>): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<EffectsHarness {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  resolveMicrophoneDeviceIdMock.mockImplementation((deviceId: string | null) => deviceId);
  resolveWebcamDeviceIdMock.mockImplementation((deviceId: string | null) => deviceId);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('skips devicechange listeners when media device events are unavailable', async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: undefined,
  });
  const refreshMicrophones = vi.fn(async () => []);
  const refreshWebcams = vi.fn(async () => []);

  await renderHarness({
    refreshMicrophones,
    refreshWebcams,
    setVideoSettings: vi.fn(),
  });

  expect(refreshMicrophones).not.toHaveBeenCalled();
  expect(refreshWebcams).not.toHaveBeenCalled();
});

it('refreshes microphones and webcams on mount and device changes', async () => {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { addEventListener, removeEventListener },
  });
  const refreshMicrophones = vi.fn(async () => []);
  const refreshWebcams = vi.fn(async () => []);

  await renderHarness({
    refreshMicrophones,
    refreshWebcams,
    setVideoSettings: vi.fn(),
  });

  expect(refreshMicrophones).toHaveBeenCalledTimes(1);
  expect(refreshWebcams).toHaveBeenCalledTimes(1);
  const deviceChangeHandler = addEventListener.mock.calls[0]?.[1] as (() => void) | undefined;
  deviceChangeHandler?.();
  expect(refreshMicrophones).toHaveBeenCalledTimes(2);
  expect(refreshWebcams).toHaveBeenCalledTimes(2);

  act(() => {
    root?.unmount();
  });
  expect(removeEventListener).toHaveBeenCalledWith('devicechange', deviceChangeHandler);
});

it('corrects stale microphone and webcam device ids from available devices', async () => {
  const setVideoSettings = vi.fn();
  resolveMicrophoneDeviceIdMock.mockReturnValue('mic-2');
  resolveWebcamDeviceIdMock.mockReturnValue('cam-2');

  await renderHarness({
    refreshMicrophones: vi.fn(async () => []),
    refreshWebcams: vi.fn(async () => []),
    setVideoSettings,
  });

  const microphoneUpdater = setVideoSettings.mock.calls[0]?.[0] as (
    settings: VideoRecordingSettings
  ) => VideoRecordingSettings;
  const webcamUpdater = setVideoSettings.mock.calls[1]?.[0] as (
    settings: VideoRecordingSettings
  ) => VideoRecordingSettings;

  expect(microphoneUpdater(createSettings()).microphoneDeviceId).toBe('mic-2');
  expect(webcamUpdater(createSettings()).webcamDeviceId).toBe('cam-2');
});

it('keeps settings object identity when resolved device ids are unchanged', async () => {
  const setVideoSettings = vi.fn();

  await renderHarness({
    refreshMicrophones: vi.fn(async () => []),
    refreshWebcams: vi.fn(async () => []),
    setVideoSettings,
  });

  const microphoneUpdater = setVideoSettings.mock.calls[0]?.[0] as (
    settings: VideoRecordingSettings
  ) => VideoRecordingSettings;
  const settings = createSettings();

  expect(microphoneUpdater(settings)).toBe(settings);
});
