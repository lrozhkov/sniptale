// @vitest-environment jsdom
import { act } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { StoragePressureLevel } from '../../../features/media-hub/storage-capacity';
import type { MicrophoneOption } from '../../recording/microphone';
import type { WebcamOption } from '../../recording/webcam';
import { usePopupRuntimeActions } from './effects';

const {
  browserTabsQueryMock,
  loggerErrorMock,
  refreshMicrophoneDevicesMock,
  refreshWebcamDevicesMock,
  useGalleryStatusUpdaterMock,
} = vi.hoisted(() => ({
  browserTabsQueryMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  refreshMicrophoneDevicesMock: vi.fn(async () => []),
  refreshWebcamDevicesMock: vi.fn(async () => []),
  useGalleryStatusUpdaterMock: vi.fn(() => vi.fn()),
}));

vi.mock('@sniptale/platform/browser/tabs', (_importOriginal) => ({
  browserTabs: {
    query: browserTabsQueryMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', (_importOriginal) => ({
  createLogger: ({ namespace }: { namespace: string }) => ({
    child: () => {
      throw new Error(`Logger child() is not expected in ${namespace} tests`);
    },
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../recording/microphone-flow', (_importOriginal) => ({
  refreshMicrophoneDevices: refreshMicrophoneDevicesMock,
}));

vi.mock('../../recording/webcam-flow', (_importOriginal) => ({
  refreshWebcamDevices: refreshWebcamDevicesMock,
}));

vi.mock('../gallery/status', (_importOriginal) => ({
  useGalleryStatusUpdater: useGalleryStatusUpdaterMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestActions: ReturnType<typeof usePopupRuntimeActions> | null = null;
let setActiveTabCapabilitiesSpy: ReturnType<typeof vi.fn>;

let setActiveTabCapabilitiesMock: Dispatch<SetStateAction<ActiveTabCapabilities>>;
let setGalleryStatusMock: Dispatch<
  SetStateAction<{ text: string; pressure: StoragePressureLevel } | null>
>;
let setIsLoadingMicrophonesMock: Dispatch<SetStateAction<boolean>>;
let setIsLoadingWebcamsMock: Dispatch<SetStateAction<boolean>>;
let setMicrophoneDevicesMock: Dispatch<SetStateAction<MicrophoneOption[]>>;
let setWebcamDevicesMock: Dispatch<SetStateAction<WebcamOption[]>>;

function createDispatchMock<T>() {
  return vi.fn() as unknown as Dispatch<SetStateAction<T>>;
}

function ActionsHarness() {
  latestActions = usePopupRuntimeActions({
    microphoneDevices: [],
    webcamDevices: [],
    setActiveTabCapabilities: setActiveTabCapabilitiesMock,
    setGalleryStatus: setGalleryStatusMock,
    setIsLoadingMicrophones: setIsLoadingMicrophonesMock,
    setIsLoadingWebcams: setIsLoadingWebcamsMock,
    setMicrophoneDevices: setMicrophoneDevicesMock,
    setWebcamDevices: setWebcamDevicesMock,
  });

  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ActionsHarness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestActions = null;
  setActiveTabCapabilitiesMock = createDispatchMock<ActiveTabCapabilities>();
  setGalleryStatusMock = createDispatchMock<{
    text: string;
    pressure: StoragePressureLevel;
  } | null>();
  setIsLoadingMicrophonesMock = createDispatchMock<boolean>();
  setIsLoadingWebcamsMock = createDispatchMock<boolean>();
  setMicrophoneDevicesMock = createDispatchMock<MicrophoneOption[]>();
  setWebcamDevicesMock = createDispatchMock<WebcamOption[]>();
  setActiveTabCapabilitiesSpy = setActiveTabCapabilitiesMock as unknown as ReturnType<typeof vi.fn>;
  browserTabsQueryMock.mockReset();
  loggerErrorMock.mockReset();
  refreshMicrophoneDevicesMock.mockReset();
  refreshMicrophoneDevicesMock.mockResolvedValue([]);
  refreshWebcamDevicesMock.mockReset();
  refreshWebcamDevicesMock.mockResolvedValue([]);
  useGalleryStatusUpdaterMock.mockReset();
  useGalleryStatusUpdaterMock.mockReturnValue(vi.fn());
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestActions = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('usePopupRuntimeActions', () => {
  it('updates active tab capabilities when the active tab query succeeds', async () => {
    browserTabsQueryMock.mockResolvedValueOnce([{ id: 1, url: 'https://example.com' }]);

    await renderHarness();

    await act(async () => {
      await latestActions?.refreshActiveTabCapabilities();
    });

    expect(setActiveTabCapabilitiesSpy).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it('logs and falls back when active tab capability refresh fails', async () => {
    browserTabsQueryMock.mockRejectedValueOnce(new Error('tab query failed'));

    await renderHarness();

    await act(async () => {
      await latestActions?.refreshActiveTabCapabilities();
    });

    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to resolve active tab capabilities',
      expect.any(Error)
    );
  });
});
