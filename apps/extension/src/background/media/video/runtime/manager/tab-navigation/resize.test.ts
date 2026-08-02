import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  active: true,
  captureMode: 'TAB_CROP',
  createTransitionId: vi.fn(),
  currentRecordingId: 'recording-1',
  getRecordingTabId: vi.fn(),
  getTab: vi.fn(),
  navigationPending: false,
  recordingTabId: 7,
  readViewport: vi.fn(),
  revalidateSource: vi.fn(),
  setRuntimeState: vi.fn(),
  setViewportOutputFrozen: vi.fn(),
  stop: vi.fn(),
  waitForNavigationIdle: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: mocks.getTab },
}));
vi.mock('@sniptale/platform/security/secure-random-id', () => ({
  createSecureRandomUuid: mocks.createTransitionId,
}));
vi.mock('../../../capture-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-viewport')>()),
  readTabCaptureViewport: mocks.readViewport,
}));
vi.mock('../../../capture-surface/output-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture-surface/output-state')>()),
  setViewportOutputFrozen: mocks.setViewportOutputFrozen,
}));
vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  getVideoRecordingTabId: mocks.getRecordingTabId,
}));
vi.mock('../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../session-state')>()),
  setVideoRecordingRuntimeState: mocks.setRuntimeState,
}));
vi.mock('../controls.stop', () => ({ stopRecording: mocks.stop }));
vi.mock('./binding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./binding')>()),
  isCurrentNavigationBinding: (binding: { recordingId: string }) =>
    mocks.active && binding.recordingId === mocks.currentRecordingId,
  resolveNavigationBinding: (tabId: number) =>
    mocks.active && tabId === mocks.recordingTabId
      ? {
          captureMode: mocks.captureMode,
          generation: 2,
          recordingId: mocks.currentRecordingId,
          streamInstanceId: 'stream-1',
          tabId,
        }
      : null,
}));
vi.mock('./source-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./source-validation')>()),
  revalidateTabSource: mocks.revalidateSource,
}));
vi.mock('./transaction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transaction')>()),
  isTabNavigationTransactionPending: () => mocks.navigationPending,
  waitForTabNavigationTransactionIdle: mocks.waitForNavigationIdle,
}));

import { resetExactOutputTransitionForTests } from './output-transition';
import { queueTabRecordingWindowBoundsChanged, resetTabRecordingResizeForTests } from './resize';

const viewport = {
  devicePixelRatio: 2,
  height: 720,
  scrollX: 0,
  scrollY: 0,
  width: 1280,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetTabRecordingResizeForTests();
  resetExactOutputTransitionForTests();
  mocks.active = true;
  mocks.captureMode = 'TAB_CROP';
  mocks.currentRecordingId = 'recording-1';
  mocks.navigationPending = false;
  mocks.recordingTabId = 7;
  mocks.createTransitionId.mockReturnValue('resize-1');
  mocks.getRecordingTabId.mockImplementation(() => mocks.recordingTabId);
  mocks.getTab.mockResolvedValue({ id: 7, windowId: 4 });
  mocks.readViewport.mockResolvedValue(viewport);
  mocks.revalidateSource.mockResolvedValue(undefined);
  mocks.setViewportOutputFrozen.mockResolvedValue('applied');
  mocks.stop.mockResolvedValue({ result: 'accepted' });
  mocks.waitForNavigationIdle.mockResolvedValue(undefined);
});

it('freezes, remeasures, remaps, and thaws full TAB without replacing the output canvas', async () => {
  mocks.captureMode = 'TAB';

  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() => expect(mocks.revalidateSource).toHaveBeenCalledOnce());

  expect(mocks.getTab).toHaveBeenCalledWith(7);
  expect(mocks.readViewport).toHaveBeenCalledWith(7);
  expect(mocks.revalidateSource).toHaveBeenCalledWith(
    expect.objectContaining({ captureMode: 'TAB', recordingId: 'recording-1' }),
    viewport,
    'resize-1'
  );
  expect(mocks.setViewportOutputFrozen.mock.calls.map(([, frozen]) => frozen)).toEqual([
    true,
    false,
  ]);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it('ignores unrelated windows and non-tab recording state', async () => {
  expect(queueTabRecordingWindowBoundsChanged(9)).toBe(true);
  await vi.waitFor(() => expect(mocks.getTab).toHaveBeenCalledOnce());
  expect(mocks.setViewportOutputFrozen).not.toHaveBeenCalled();

  mocks.active = false;
  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(false);
  expect(mocks.getTab).toHaveBeenCalledOnce();
});

it('freezes, reads authoritative viewport, revalidates, and thaws with one fresh identity', async () => {
  const order: string[] = [];
  mocks.setViewportOutputFrozen.mockImplementation(async (_binding, frozen: boolean) => {
    order.push(frozen ? 'freeze' : 'thaw');
    return 'applied';
  });
  mocks.readViewport.mockImplementation(async () => {
    order.push('viewport');
    return viewport;
  });
  mocks.revalidateSource.mockImplementation(async () => {
    order.push('revalidate');
  });

  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() => expect(order).toEqual(['freeze', 'viewport', 'revalidate', 'thaw']));

  expect(mocks.createTransitionId).toHaveBeenCalledOnce();
  expect(mocks.revalidateSource).toHaveBeenCalledWith(
    expect.objectContaining({
      generation: 2,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-1',
      tabId: 7,
    }),
    viewport,
    'resize-1'
  );
  expect(mocks.setViewportOutputFrozen.mock.calls.map(([, frozen]) => frozen)).toEqual([
    true,
    false,
  ]);
});

it('coalesces a synchronous bounds burst into one authoritative viewport commit', async () => {
  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);

  await vi.waitFor(() => expect(mocks.revalidateSource).toHaveBeenCalledOnce());
  expect(mocks.getTab).toHaveBeenCalledOnce();
  expect(mocks.readViewport).toHaveBeenCalledOnce();
  expect(mocks.createTransitionId).toHaveBeenCalledOnce();
});

it('does not let an unrelated window replace a queued recording-window resize', async () => {
  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  expect(queueTabRecordingWindowBoundsChanged(9)).toBe(true);

  await vi.waitFor(() => expect(mocks.revalidateSource).toHaveBeenCalledOnce());
  expect(mocks.getTab).toHaveBeenCalledTimes(2);
  expect(mocks.readViewport).toHaveBeenCalledOnce();
  expect(mocks.createTransitionId).toHaveBeenCalledOnce();
});

it('drops a stale binding after the recording-window lookup boundary', async () => {
  let resolveTab!: (tab: chrome.tabs.Tab) => void;
  mocks.getTab.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveTab = resolve;
    })
  );

  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() => expect(mocks.getTab).toHaveBeenCalledOnce());
  mocks.active = false;
  resolveTab({ id: 7, windowId: 4 } as chrome.tabs.Tab);
  await Promise.resolve().then(() => Promise.resolve());

  expect(mocks.createTransitionId).not.toHaveBeenCalled();
  expect(mocks.setViewportOutputFrozen).not.toHaveBeenCalled();
});

it('waits for navigation authority before starting a resize transition', async () => {
  let finishNavigation!: () => void;
  mocks.navigationPending = true;
  mocks.waitForNavigationIdle.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishNavigation = resolve;
    })
  );

  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() => expect(mocks.waitForNavigationIdle).toHaveBeenCalledOnce());
  expect(mocks.setViewportOutputFrozen).not.toHaveBeenCalled();

  mocks.navigationPending = false;
  finishNavigation();
  await vi.waitFor(() => expect(mocks.revalidateSource).toHaveBeenCalledOnce());
  expect(mocks.getTab).toHaveBeenCalledTimes(2);
});

it('lets a newer bounds request replace one waiting on stale navigation authority', async () => {
  mocks.navigationPending = true;
  mocks.waitForNavigationIdle.mockReturnValueOnce(new Promise(() => undefined));

  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() => expect(mocks.waitForNavigationIdle).toHaveBeenCalledOnce());

  mocks.navigationPending = false;
  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() => expect(mocks.revalidateSource).toHaveBeenCalledOnce());
  expect(mocks.createTransitionId).toHaveBeenCalledOnce();
});

it('releases a stale navigation wait for the next recording in a different window', async () => {
  mocks.navigationPending = true;
  mocks.waitForNavigationIdle.mockReturnValueOnce(new Promise(() => undefined));
  mocks.getTab.mockImplementation(async (tabId: number) => ({
    id: tabId,
    windowId: tabId === 7 ? 4 : 9,
  }));

  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() => expect(mocks.waitForNavigationIdle).toHaveBeenCalledOnce());

  mocks.currentRecordingId = 'recording-2';
  mocks.recordingTabId = 8;
  mocks.navigationPending = false;
  expect(queueTabRecordingWindowBoundsChanged(9)).toBe(true);

  await vi.waitFor(() =>
    expect(mocks.revalidateSource).toHaveBeenCalledWith(
      expect.objectContaining({ recordingId: 'recording-2', tabId: 8 }),
      viewport,
      'resize-1'
    )
  );
  expect(mocks.readViewport).toHaveBeenCalledOnce();
});

it('stops the active binding when exact geometry revalidation fails', async () => {
  mocks.revalidateSource.mockRejectedValueOnce(new Error('resize geometry unavailable'));

  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledWith(false));

  expect(mocks.setRuntimeState).toHaveBeenCalledWith({ error: 'resize geometry unavailable' });
  expect(mocks.setViewportOutputFrozen.mock.calls.map(([, frozen]) => frozen)).toEqual([true]);
});

it('thaws after a recoverable TAB_CROP resize without invoking critical STOP', async () => {
  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() =>
    expect(mocks.setViewportOutputFrozen.mock.calls.map(([, frozen]) => frozen)).toEqual([
      true,
      false,
    ])
  );

  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.setRuntimeState).not.toHaveBeenCalled();
});

it('does not revalidate or thaw after the binding changes during viewport read', async () => {
  let resolveViewport!: () => void;
  mocks.readViewport.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveViewport = () => resolve(viewport);
    })
  );

  expect(queueTabRecordingWindowBoundsChanged(4)).toBe(true);
  await vi.waitFor(() => expect(mocks.readViewport).toHaveBeenCalledOnce());
  mocks.active = false;
  resolveViewport();
  await Promise.resolve().then(() => Promise.resolve());

  expect(mocks.revalidateSource).not.toHaveBeenCalled();
  expect(mocks.setViewportOutputFrozen.mock.calls.map(([, frozen]) => frozen)).toEqual([true]);
  expect(mocks.stop).not.toHaveBeenCalled();
});
