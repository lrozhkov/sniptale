import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  armDebuggerActivation: vi.fn(() => ({ token: 'activation-1' })),
  attachDebugger: vi.fn(),
  clearViewport: vi.fn(),
  detachDebugger: vi.fn(),
  getViewportWorkspace: vi.fn(),
  getZoom: vi.fn(),
  handleForcefulDetach: vi.fn(),
  hasAttachedClient: vi.fn(),
  readViewportCapacity: vi.fn(),
  setViewport: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { getZoom: mocks.getZoom },
}));
vi.mock('../diagnostics/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../diagnostics/lifecycle')>()),
  armDebuggerActivation: mocks.armDebuggerActivation,
  attachDebugger: mocks.attachDebugger,
  clearViewport: mocks.clearViewport,
  detachDebugger: mocks.detachDebugger,
  getViewportWorkspace: mocks.getViewportWorkspace,
  setViewport: mocks.setViewport,
}));
vi.mock('../debugger/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../debugger/session')>()),
  hasAttachedClient: mocks.hasAttachedClient,
  handleForcefulDetach: mocks.handleForcefulDetach,
}));
vi.mock('./viewport-capacity', () => ({
  readViewportCapacity: mocks.readViewportCapacity,
}));

import {
  acknowledgeClosedViewportTab,
  getCurrentViewportSize,
  getTabZoom,
  prepareViewportSurface,
  restoreViewportSnapshot,
  setViewportSurface,
  viewportSnapshotMatches,
} from './viewport';
import { ViewportMutationError } from '../diagnostics/lifecycle';
import { CaptureSurfaceMutationError } from './types';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.attachDebugger.mockResolvedValue(undefined);
  mocks.detachDebugger.mockResolvedValue(undefined);
  mocks.getZoom.mockResolvedValue(1);
  mocks.getViewportWorkspace.mockResolvedValue({ width: 1280, height: 720 });
  mocks.hasAttachedClient.mockReturnValue(false);
  mocks.readViewportCapacity.mockResolvedValue({ width: 1280, height: 720 });
  mocks.setViewport.mockResolvedValue(undefined);
  mocks.clearViewport.mockResolvedValue(undefined);
});

it('reads tab zoom through the platform adapter', async () => {
  await expect(getTabZoom(7)).resolves.toBe(1);
});

it('acknowledges the debugger effect as gone when Chrome reports a closed tab', () => {
  acknowledgeClosedViewportTab(7);
  expect(mocks.handleForcefulDetach).toHaveBeenCalledWith(7);
});

it('prepares screenshot and video debugger clients without attaching after a failed native read', async () => {
  const prepared = await prepareViewportSurface({ owner: 'screenshot', tabId: 7 });
  expect(prepared).toMatchObject({ current: { width: 1280, height: 720 } });
  expect(mocks.attachDebugger).toHaveBeenCalledWith(
    7,
    'capture-surface-screenshot',
    expect.objectContaining({ token: 'activation-1' })
  );

  mocks.readViewportCapacity.mockRejectedValueOnce(new Error('metrics failed'));
  mocks.attachDebugger.mockClear();
  await expect(prepareViewportSurface({ owner: 'video', tabId: 7 })).rejects.toThrow(
    'metrics failed'
  );
  expect(mocks.attachDebugger).not.toHaveBeenCalled();
  expect(mocks.detachDebugger).not.toHaveBeenCalled();

  mocks.hasAttachedClient.mockReturnValueOnce(true);
  mocks.readViewportCapacity.mockRejectedValueOnce(new Error('owned metrics failed'));
  await expect(prepareViewportSurface({ owner: 'screenshot', tabId: 7 })).rejects.toThrow(
    'owned metrics failed'
  );
  expect(mocks.detachDebugger).not.toHaveBeenCalled();

  await prepared.releaseAcquisition();
  expect(mocks.detachDebugger).toHaveBeenCalledWith(7, 'capture-surface-screenshot');

  mocks.detachDebugger.mockClear();
  mocks.hasAttachedClient.mockReturnValueOnce(true);
  const shared = await prepareViewportSurface({ owner: 'screenshot', tabId: 7 });
  expect(shared.acquired).toBe(false);
  await shared.releaseAcquisition();
  expect(mocks.detachDebugger).not.toHaveBeenCalled();
});

it('captures native size before debugger attach and verifies restore after detach', async () => {
  const events: string[] = [];
  mocks.readViewportCapacity
    .mockImplementationOnce(async () => {
      events.push('read-before-attach');
      return { width: 1440, height: 900 };
    })
    .mockImplementationOnce(async () => {
      events.push('read-after-detach');
      return { width: 1440, height: 900 };
    });
  mocks.attachDebugger.mockImplementationOnce(async () => {
    events.push('attach');
  });
  mocks.clearViewport.mockImplementationOnce(async () => {
    events.push('clear');
  });
  mocks.detachDebugger.mockImplementationOnce(async () => {
    events.push('detach');
  });

  const prepared = await prepareViewportSurface({ owner: 'screenshot', tabId: 7 });
  expect(prepared.current).toEqual({ width: 1440, height: 900 });
  expect(events.slice(0, 2)).toEqual(['read-before-attach', 'attach']);

  await restoreViewportSnapshot({
    owner: 'screenshot',
    snapshot: { type: 'native', width: 1440, height: 900 },
    tabId: 7,
  });
  expect(events.slice(-3)).toEqual(['clear', 'detach', 'read-after-detach']);
});

it('accepts the current natural viewport after debugger chrome changes its dimensions', async () => {
  mocks.readViewportCapacity.mockResolvedValueOnce({ width: 1279, height: 720 });

  await expect(
    restoreViewportSnapshot({
      owner: 'screenshot',
      snapshot: { type: 'native', width: 1280, height: 720 },
      tabId: 7,
    })
  ).resolves.toBeUndefined();
  expect(mocks.readViewportCapacity).toHaveBeenCalledOnce();
});

it('sets, reads, compares, and restores exact viewport snapshots', async () => {
  await setViewportSurface({ tabId: 7, width: 1024, height: 768 });
  expect(mocks.setViewport).toHaveBeenCalledWith(7, 1024, 768);
  await expect(getCurrentViewportSize(7)).resolves.toEqual({ width: 1280, height: 720 });
  expect(
    viewportSnapshotMatches(
      { type: 'viewport', presetId: 'preset-1', width: 1280, height: 720 },
      { width: 1280, height: 720 }
    )
  ).toBe(true);

  await restoreViewportSnapshot({
    owner: 'video',
    snapshot: { type: 'viewport', presetId: 'preset-1', width: 1024, height: 768 },
    tabId: 7,
  });
  expect(mocks.setViewport).toHaveBeenCalledWith(7, 1024, 768);

  await restoreViewportSnapshot({
    owner: 'screenshot',
    snapshot: { type: 'native', width: 1280, height: 720 },
    tabId: 7,
  });
  expect(mocks.clearViewport).toHaveBeenCalledWith(7);
  expect(mocks.detachDebugger).toHaveBeenCalledWith(7, 'capture-surface-screenshot');
});

it('reports an observed viewport mutation so the surface owner can roll it back', async () => {
  mocks.setViewport.mockRejectedValueOnce(
    new ViewportMutationError('verification-failed', {
      cssWidth: 1265,
      cssHeight: 720,
    })
  );

  const failure = await setViewportSurface({ tabId: 7, width: 1280, height: 720 }).catch(
    (error: unknown) => error
  );

  expect(failure).toBeInstanceOf(CaptureSurfaceMutationError);
  expect(failure).toMatchObject({
    message: 'verification-failed',
    observedSnapshot: {
      type: 'viewport',
      presetId: 'uncommitted',
      width: 1265,
      height: 720,
    },
  });
});

it('preserves generic viewport platform failures', async () => {
  const failure = new Error('debugger unavailable');
  mocks.setViewport.mockRejectedValueOnce(failure);

  await expect(setViewportSurface({ tabId: 7, width: 1280, height: 720 })).rejects.toBe(failure);
});

it('fails closed when a restore target is invalid or cannot be verified', async () => {
  await expect(
    restoreViewportSnapshot({
      owner: 'screenshot',
      snapshot: { type: 'window', left: 0, top: 0, width: 800, height: 600, state: 'normal' },
      tabId: 7,
    })
  ).rejects.toThrow('restore-impossible');

  mocks.detachDebugger.mockClear();
  mocks.setViewport.mockRejectedValueOnce(new Error('viewport verification failed'));
  await expect(
    restoreViewportSnapshot({
      owner: 'video',
      snapshot: { type: 'viewport', presetId: 'preset-1', width: 1024, height: 768 },
      tabId: 7,
    })
  ).rejects.toThrow('viewport verification failed');
  expect(mocks.detachDebugger).toHaveBeenCalledWith(7, 'capture-surface-video');
});
