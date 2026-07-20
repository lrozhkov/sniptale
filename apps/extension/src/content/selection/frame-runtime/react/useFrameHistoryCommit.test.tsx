// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createFrameDataFixture } from './test-support';

const historyMocks = vi.hoisted(() => ({
  beginDeferredCommit: vi.fn(),
  cancelDeferredCommit: vi.fn(),
  finalizeDeferredCommit: vi.fn(),
  hasOpenTransactions: vi.fn(),
}));

vi.mock('../../../parser/page-preparation/history', () => ({
  pagePreparationHistory: historyMocks,
}));

import {
  createHistoryWrappedFrameManager,
  useHistoryCommitCoordinator,
} from './useFrameHistoryCommit';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestWithHistoryCommit: ReturnType<typeof useHistoryCommitCoordinator> | null = null;

function createFrame(id: string): FrameData {
  return createFrameDataFixture(id);
}

function Harness({ frames }: { frames: FrameData[] }) {
  latestWithHistoryCommit = useHistoryCommitCoordinator(frames);
  return null;
}

async function renderHarness(frames: FrameData[]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness frames={frames} />);
  });
}

function createFrameManager() {
  return {
    addAutoBlurFrames: vi.fn(),
    addFrame: vi.fn(),
    clearAutoBlurFrames: vi.fn(),
    clearFrames: vi.fn(),
    frames: [],
    getGlobalStepBadgeSettings: vi.fn(),
    hasFrameForElement: vi.fn(),
    recalculateStepBadges: vi.fn(),
    removeFrame: vi.fn(),
    syncFocusOpacity: vi.fn(),
    syncAutoBlurFrames: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
    updateFrameStepBadge: vi.fn(),
    updateGlobalStepBadgeSettings: vi.fn(),
  };
}

describe('frame-manager-history-commit', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    historyMocks.beginDeferredCommit.mockReset();
    historyMocks.cancelDeferredCommit.mockReset();
    historyMocks.finalizeDeferredCommit.mockReset();
    historyMocks.hasOpenTransactions.mockReset();
    historyMocks.beginDeferredCommit.mockReturnValue(11);
    historyMocks.hasOpenTransactions.mockReturnValue(false);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    latestWithHistoryCommit = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it(
    'finalizes deferred commits for wrapped actions after the micro-lifecycle tick',
    expectDeferredCommitFinalization
  );

  it(
    'skips deferred commit creation when page-preparation transactions are already open',
    expectOpenTransactionBypass
  );

  it('wraps only history-sensitive frame-manager actions', expectHistoryWrappedActions);
  it(
    'cancels deferred commits when the wrapped action throws before queueing',
    expectThrownActionRollback
  );
});

async function expectDeferredCommitFinalization() {
  const action = vi.fn();

  await renderHarness([createFrame('frame-1')]);
  const wrappedAction = latestWithHistoryCommit?.(action);
  await act(async () => {
    wrappedAction?.('value' as never);
  });

  expect(historyMocks.beginDeferredCommit).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledWith('value');
  expect(historyMocks.finalizeDeferredCommit).not.toHaveBeenCalled();

  await act(async () => {
    await vi.runAllTimersAsync();
  });

  expect(historyMocks.finalizeDeferredCommit).toHaveBeenCalledWith(11);
}

async function expectOpenTransactionBypass() {
  const action = vi.fn();
  historyMocks.hasOpenTransactions.mockReturnValue(true);

  await renderHarness([createFrame('frame-1')]);
  const wrappedAction = latestWithHistoryCommit?.(action);
  await act(async () => {
    wrappedAction?.('value' as never);
  });

  expect(historyMocks.beginDeferredCommit).not.toHaveBeenCalled();
  expect(action).toHaveBeenCalledWith('value');
  expect(historyMocks.finalizeDeferredCommit).not.toHaveBeenCalled();
}

function expectHistoryWrappedActions() {
  const withHistoryCommit = vi.fn(<T extends (...args: never[]) => unknown>(action: T) => action);
  const frameManager = createFrameManager();

  const wrapped = createHistoryWrappedFrameManager(frameManager, withHistoryCommit as never);

  expect(withHistoryCommit).toHaveBeenCalledTimes(9);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(1, frameManager.addAutoBlurFrames);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(2, frameManager.addFrame);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(3, frameManager.clearAutoBlurFrames);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(4, frameManager.clearFrames);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(5, frameManager.removeFrame);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(6, frameManager.syncFocusOpacity);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(7, frameManager.syncAutoBlurFrames);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(8, frameManager.updateFrame);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(9, frameManager.updateFrameEffect);
  expect(wrapped.updateFrameStepBadge).toBe(frameManager.updateFrameStepBadge);
  expect(wrapped.updateGlobalStepBadgeSettings).toBe(frameManager.updateGlobalStepBadgeSettings);
}

async function expectThrownActionRollback() {
  const action = vi.fn(() => {
    throw new Error('frame failed');
  });

  await renderHarness([createFrame('frame-1')]);
  const wrappedAction = latestWithHistoryCommit?.(action);

  expect(() => wrappedAction?.()).toThrow('frame failed');
  expect(historyMocks.cancelDeferredCommit).toHaveBeenCalledWith(11);
  expect(historyMocks.finalizeDeferredCommit).not.toHaveBeenCalled();
}
