import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureSurfaceError, type CaptureSurfaceLeaseState } from './types';

const mocks = vi.hoisted(() => ({
  getWindowSnapshot: vi.fn(),
  restoreWindowSnapshot: vi.fn(),
}));

vi.mock('./window', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./window')>()),
  getWindowSnapshot: mocks.getWindowSnapshot,
  restoreWindowSnapshot: mocks.restoreWindowSnapshot,
  windowSnapshotsEqual: (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right),
}));

import {
  captureSurfaceSnapshotsEqual,
  readCurrentSurfaceSnapshot,
  restoreCaptureSurfaceSnapshot,
  transitionCaptureSurfaceSnapshot,
} from './restoration';

const prior = {
  height: 900,
  left: 0,
  state: 'normal' as const,
  top: 0,
  type: 'window' as const,
  width: 1440,
};
const applied = { ...prior, height: 720, width: 1280 };
const state = {
  applied: {
    generation: 1,
    height: 720,
    leaseId: 'lease-1',
    presetId: 'window-hd',
    sessionId: 'session-1',
    target: 'window' as const,
    width: 1280,
  },
  entry: {
    applied,
    generation: 1,
    leaseId: 'lease-1',
    owner: 'video' as const,
    parentLeaseId: null,
    phase: 'applied' as const,
    presetId: 'window-hd',
    prior,
    sessionId: 'session-1',
    tabId: 7,
    target: 'window' as const,
    updatedAt: 1,
    version: 1 as const,
    windowId: 3,
  },
  prior,
} satisfies CaptureSurfaceLeaseState;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWindowSnapshot.mockResolvedValue(applied);
  mocks.restoreWindowSnapshot.mockResolvedValue(undefined);
});

it('reads and compares the native browser-window snapshot', async () => {
  await expect(readCurrentSurfaceSnapshot(state)).resolves.toMatchObject({
    acquired: false,
    current: applied,
  });
  expect(captureSurfaceSnapshotsEqual(applied, { ...applied })).toBe(true);
  expect(captureSurfaceSnapshotsEqual(applied, prior)).toBe(false);
});

it('normalizes native restore failures and preserves typed failures', async () => {
  mocks.restoreWindowSnapshot.mockRejectedValueOnce(new Error('window closed'));
  await expect(restoreCaptureSurfaceSnapshot(state)).rejects.toMatchObject({
    code: 'restore-impossible',
    message: 'window closed',
  });
  mocks.restoreWindowSnapshot.mockRejectedValueOnce(new CaptureSurfaceError('permission-denied'));
  await expect(restoreCaptureSurfaceSnapshot(state)).rejects.toMatchObject({
    code: 'permission-denied',
  });
});

it('transitions only from an expected snapshot or an already-restored snapshot', async () => {
  await transitionCaptureSurfaceSnapshot({ expected: [applied], next: prior, state });
  expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, prior);

  mocks.getWindowSnapshot.mockResolvedValueOnce(prior);
  mocks.restoreWindowSnapshot.mockClear();
  await transitionCaptureSurfaceSnapshot({ expected: [applied], next: prior, state });
  expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();

  mocks.getWindowSnapshot.mockResolvedValueOnce({ ...applied, left: 1 });
  await expect(
    transitionCaptureSurfaceSnapshot({ expected: [applied], next: prior, state })
  ).rejects.toMatchObject({ code: 'restore-conflict' });
});

it('normalizes transition restore failures including non-Error values', async () => {
  mocks.restoreWindowSnapshot.mockRejectedValueOnce('native rejection');
  await expect(
    transitionCaptureSurfaceSnapshot({ expected: [applied], next: prior, state })
  ).rejects.toMatchObject({ code: 'restore-impossible', message: 'native rejection' });

  mocks.restoreWindowSnapshot.mockRejectedValueOnce(new CaptureSurfaceError('permission-denied'));
  await expect(
    transitionCaptureSurfaceSnapshot({ expected: [applied], next: prior, state })
  ).rejects.toMatchObject({ code: 'permission-denied' });
});
