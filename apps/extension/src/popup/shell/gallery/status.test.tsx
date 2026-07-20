// @vitest-environment jsdom

import { act } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoragePressureLevel } from '../../../features/media-hub/storage-capacity';
import { useGalleryStatusUpdater } from './status';

const { getStorageEstimateInfoMock, loggerErrorMock } = vi.hoisted(() => ({
  getStorageEstimateInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('../../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal()),
  getStorageEstimateInfo: getStorageEstimateInfoMock,
}));

vi.mock('../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/format-bytes')>()),
  formatBytes: (value: number) => `${value} B`,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  createLogger: () => ({
    child: () => {
      throw new Error('Logger child() is not expected in popup gallery status tests');
    },
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestUpdateGalleryStatus: (() => Promise<void>) | null = null;
let setGalleryStatusSpy: ReturnType<typeof vi.fn>;

function HookHarness(props: {
  setGalleryStatus: Dispatch<
    SetStateAction<{ text: string; pressure: StoragePressureLevel } | null>
  >;
}) {
  latestUpdateGalleryStatus = useGalleryStatusUpdater(props.setGalleryStatus);
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HookHarness setGalleryStatus={setGalleryStatusSpy as never} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestUpdateGalleryStatus = null;
  setGalleryStatusSpy = vi.fn();
  getStorageEstimateInfoMock.mockReset();
  loggerErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useGalleryStatusUpdater', () => {
  it('stores the formatted usage when storage estimate succeeds', verifyFormattedUsageStatus);
  it('uses the unavailable message when storage quota is missing', verifyUnavailableStatus);
  it('logs failures and clears gallery status when storage estimate fails', verifyFailureStatus);
});

async function updateGalleryStatus(): Promise<void> {
  await renderHarness();
  await act(async () => {
    await latestUpdateGalleryStatus?.();
  });
}

async function verifyFormattedUsageStatus(): Promise<void> {
  getStorageEstimateInfoMock.mockResolvedValue({
    pressure: 'warning',
    quota: 1000,
    usage: 512,
  });

  await updateGalleryStatus();

  expect(setGalleryStatusSpy).toHaveBeenCalledWith({
    pressure: 'warning',
    text: 'popup.common.galleryStatusUsedPrefix 512 B',
  });
  expect(loggerErrorMock).not.toHaveBeenCalled();
}

async function verifyUnavailableStatus(): Promise<void> {
  getStorageEstimateInfoMock.mockResolvedValue({
    pressure: 'healthy',
    quota: 0,
    usage: 0,
  });

  await updateGalleryStatus();

  expect(setGalleryStatusSpy).toHaveBeenCalledWith({
    pressure: 'healthy',
    text: 'popup.common.galleryStatusUnavailable',
  });
}

async function verifyFailureStatus(): Promise<void> {
  const error = new Error('quota failed');
  getStorageEstimateInfoMock.mockRejectedValue(error);

  await updateGalleryStatus();

  expect(setGalleryStatusSpy).toHaveBeenCalledWith(null);
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to resolve gallery storage status', error);
}
