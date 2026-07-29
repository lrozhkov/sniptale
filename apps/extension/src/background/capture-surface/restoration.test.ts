import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentViewportSize: vi.fn(),
  getWindowSnapshot: vi.fn(),
  prepareViewportSurface: vi.fn(),
  releaseAcquisition: vi.fn(),
  restoreViewportSnapshot: vi.fn(),
  restoreWindowSnapshot: vi.fn(),
  windowSnapshotsEqual: vi.fn(),
}));

vi.mock('./viewport', () => ({
  acknowledgeClosedViewportTab: vi.fn(),
  getCurrentViewportSize: mocks.getCurrentViewportSize,
  getTabZoom: vi.fn(),
  prepareViewportSurface: mocks.prepareViewportSurface,
  releaseViewportSurfaceAcquisition: vi.fn(),
  restoreViewportSnapshot: mocks.restoreViewportSnapshot,
  setViewportSurface: vi.fn(),
  viewportSnapshotMatches: vi.fn(),
}));

vi.mock('./window', () => ({
  applyPreparedWindowSize: vi.fn(),
  getWindowSnapshot: mocks.getWindowSnapshot,
  getWindowWorkArea: vi.fn(),
  prepareWindowSize: vi.fn(),
  restoreWindowSnapshot: mocks.restoreWindowSnapshot,
  windowSnapshotsEqual: mocks.windowSnapshotsEqual,
}));

import {
  applyCaptureSurfaceSnapshot,
  captureSurfaceSnapshotsEqual,
  readCurrentSurfaceSnapshot,
  restoreCaptureSurfaceSnapshot,
} from './restoration';
import type { CaptureSurfaceLeaseState } from './types';

const nativeSnapshot = { type: 'native' as const, width: 1440, height: 900 };
const viewportSnapshot = {
  type: 'viewport' as const,
  presetId: 'viewport-1',
  width: 1280,
  height: 720,
};
const windowSnapshot = {
  type: 'window' as const,
  left: -1200,
  top: 0,
  width: 1200,
  height: 800,
  state: 'normal' as const,
};

function lease(target: 'viewport' | 'window'): CaptureSurfaceLeaseState {
  const prior = target === 'viewport' ? nativeSnapshot : windowSnapshot;
  const applied = target === 'viewport' ? viewportSnapshot : windowSnapshot;
  return {
    applied: {
      generation: 1,
      height: applied.height,
      leaseId: 'lease-1',
      presetId: 'preset-1',
      sessionId: 'session-1',
      target,
      width: applied.width,
    },
    prior,
    viewportAcquisitionOwned: false,
    entry: {
      applied,
      generation: 1,
      leaseId: 'lease-1',
      owner: 'screenshot',
      parentLeaseId: null,
      phase: 'applied',
      presetId: 'preset-1',
      prior,
      sessionId: 'session-1',
      tabId: 7,
      target,
      updatedAt: 1,
      version: 1,
      windowId: 3,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentViewportSize.mockResolvedValue({ width: 1280, height: 720 });
  mocks.getWindowSnapshot.mockResolvedValue(windowSnapshot);
  mocks.prepareViewportSurface.mockResolvedValue({
    current: { width: 1280, height: 720 },
    releaseAcquisition: mocks.releaseAcquisition,
  });
  mocks.releaseAcquisition.mockResolvedValue(undefined);
  mocks.restoreViewportSnapshot.mockResolvedValue(undefined);
  mocks.restoreWindowSnapshot.mockResolvedValue(undefined);
  mocks.windowSnapshotsEqual.mockReturnValue(true);
});

it('reads exact window and viewport observations with explicit acquisition ownership', async () => {
  const windowObservation = await readCurrentSurfaceSnapshot(lease('window'));
  expect(windowObservation.current).toEqual(windowSnapshot);
  await expect(windowObservation.releaseAcquisition()).resolves.toBeUndefined();

  const viewportObservation = await readCurrentSurfaceSnapshot(lease('viewport'));
  expect(viewportObservation.current).toEqual({ type: 'native', width: 1280, height: 720 });
  await viewportObservation.releaseAcquisition();
  expect(mocks.releaseAcquisition).toHaveBeenCalledOnce();
});

it('releases a viewport acquisition when exact observation fails', async () => {
  mocks.getCurrentViewportSize.mockRejectedValueOnce(new Error('metrics unavailable'));

  await expect(readCurrentSurfaceSnapshot(lease('viewport'))).rejects.toThrow(
    'metrics unavailable'
  );
  expect(mocks.releaseAcquisition).toHaveBeenCalledOnce();
});

it('compares only compatible snapshot targets', () => {
  expect(captureSurfaceSnapshotsEqual(windowSnapshot, windowSnapshot)).toBe(true);
  expect(mocks.windowSnapshotsEqual).toHaveBeenCalledOnce();
  expect(captureSurfaceSnapshotsEqual(nativeSnapshot, viewportSnapshot)).toBe(false);
  expect(captureSurfaceSnapshotsEqual(nativeSnapshot, windowSnapshot)).toBe(false);
});

it('restores prior window and viewport snapshots and wraps platform failures', async () => {
  await restoreCaptureSurfaceSnapshot(lease('window'));
  expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, windowSnapshot);

  await restoreCaptureSurfaceSnapshot(lease('viewport'));
  expect(mocks.restoreViewportSnapshot).toHaveBeenCalledWith({
    owner: 'screenshot',
    snapshot: nativeSnapshot,
    tabId: 7,
  });

  mocks.restoreViewportSnapshot.mockRejectedValueOnce(new Error('detach failed'));
  await expect(restoreCaptureSurfaceSnapshot(lease('viewport'))).rejects.toMatchObject({
    code: 'restore-impossible',
    message: 'detach failed',
  });
});

it('applies exact window and viewport snapshots and wraps platform failures', async () => {
  const state = lease('viewport');
  await applyCaptureSurfaceSnapshot(state, windowSnapshot);
  expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, windowSnapshot);

  await applyCaptureSurfaceSnapshot(state, viewportSnapshot);
  expect(mocks.restoreViewportSnapshot).toHaveBeenCalledWith({
    owner: 'screenshot',
    snapshot: viewportSnapshot,
    tabId: 7,
  });

  mocks.restoreWindowSnapshot.mockRejectedValueOnce('window rejected');
  await expect(applyCaptureSurfaceSnapshot(state, windowSnapshot)).rejects.toMatchObject({
    code: 'restore-impossible',
    message: 'window rejected',
  });
});
