// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { MicrophoneOption } from '../../recording/microphone';
import type { WebcamOption } from '../../recording/webcam';
import { usePopupMediaDeviceEffects } from './media-device-effects';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import type { PopupPage } from '../navigation/actions';

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

function EffectsHarness({
  refreshMicrophones,
  refreshWebcams,
  page = 'video',
}: {
  refreshMicrophones: () => Promise<MicrophoneOption[]>;
  refreshWebcams: () => Promise<WebcamOption[]>;
  page?: PopupPage;
}) {
  usePopupMediaDeviceEffects({
    page,
    refreshMicrophones,
    refreshWebcams,
    videoSettings: DEFAULT_VIDEO_SETTINGS,
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
  });

  expect(refreshMicrophones).not.toHaveBeenCalled();
  expect(refreshWebcams).not.toHaveBeenCalled();
});

it('does not enumerate or subscribe outside the Video page', async () => {
  const addEventListener = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { addEventListener, removeEventListener: vi.fn() },
  });
  const refreshMicrophones = vi.fn(async () => []);
  const refreshWebcams = vi.fn(async () => []);

  await renderHarness({ page: 'home', refreshMicrophones, refreshWebcams });

  expect(refreshMicrophones).not.toHaveBeenCalled();
  expect(refreshWebcams).not.toHaveBeenCalled();
  expect(addEventListener).not.toHaveBeenCalled();
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

it('does not resolve or rewrite saved device preferences from transient availability', async () => {
  resolveMicrophoneDeviceIdMock.mockReturnValue('mic-2');
  resolveWebcamDeviceIdMock.mockReturnValue('cam-2');

  await renderHarness({
    refreshMicrophones: vi.fn(async () => []),
    refreshWebcams: vi.fn(async () => []),
  });

  expect(resolveMicrophoneDeviceIdMock).not.toHaveBeenCalled();
  expect(resolveWebcamDeviceIdMock).not.toHaveBeenCalled();
});
