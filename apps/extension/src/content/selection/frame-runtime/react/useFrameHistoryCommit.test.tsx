// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import type { FrameMutableRef, FrameSetter } from '../contracts';
import { createFrameDataFixture } from './test-support';

const historyMocks = vi.hoisted(() => ({
  beginDeferredCommit: vi.fn(),
  cancelDeferredCommit: vi.fn(),
  finalizeDeferredCommit: vi.fn(),
  hasOpenTransactions: vi.fn(),
}));

const annotationMocks = vi.hoisted(() => ({
  captureFailedMutationRollbackPoint: vi.fn(),
  rollbackFailedMutation: vi.fn(),
  syncFrames: vi.fn(),
}));

vi.mock('../../../parser/page-preparation/annotations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../parser/page-preparation/annotations')>()),
  browserAnnotationSession: annotationMocks,
}));

vi.mock('../../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../parser/page-preparation/history')>()),
  pagePreparationHistory: historyMocks,
}));

import {
  createHistoryWrappedFrameManager,
  useHistoryCommitCoordinator,
} from './useFrameHistoryCommit';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestWithHistoryCommit: ReturnType<typeof useHistoryCommitCoordinator> | null = null;
let framesRef: FrameMutableRef<FrameData[]>;
let setFrames: FrameSetter;

function createFrame(id: string): FrameData {
  return createFrameDataFixture(id);
}

function Harness() {
  latestWithHistoryCommit = useHistoryCommitCoordinator({ framesRef, setFrames });
  return null;
}

async function renderHarness(frames: FrameData[]) {
  framesRef.current = frames;
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

function createFrameManager() {
  return {
    addAutoBlurFrames: vi.fn(),
    addFrame: vi.fn(),
    addFreeFrame: vi.fn(),
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
    Object.values(historyMocks).forEach((mock) => mock.mockReset());
    Object.values(annotationMocks).forEach((mock) => mock.mockReset());
    historyMocks.beginDeferredCommit.mockReturnValue(11);
    historyMocks.hasOpenTransactions.mockReturnValue(false);
    annotationMocks.captureFailedMutationRollbackPoint.mockReturnValue({ point: true });
    annotationMocks.rollbackFailedMutation.mockReturnValue(true);
    framesRef = { current: [] };
    setFrames = vi.fn((update) => {
      framesRef.current = typeof update === 'function' ? update(framesRef.current) : update;
    });
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
    'publishes factual frame evidence before finalizing a deferred history commit',
    expectDeferredCommitFinalization
  );
  it(
    'publishes evidence inside an already-open explicit transaction without owning it',
    expectOpenTransactionBypass
  );
  it('wraps only history-sensitive frame-manager actions', expectHistoryWrappedActions);
  it('synchronizes frame add, remove, and re-add actions', expectFrameLifecycleSynchronization);
  it(
    'restores frame and annotation authorities when a mutating action throws',
    expectActionFailure
  );
  it('restores both authorities when the frame producer throws', expectProducerFailure);
  it('refuses to mutate when no history boundary can be acquired', expectUnavailableHistory);
  it(
    'surfaces every compensation failure without hiding the original error',
    expectRollbackFailures
  );
});

async function expectDeferredCommitFinalization() {
  const frame = createFrame('frame-1');
  const action = vi.fn(() => {
    framesRef.current = [frame];
  });

  await renderHarness([]);
  const wrappedAction = latestWithHistoryCommit?.(action);
  await act(async () => {
    wrappedAction?.();
  });

  expect(historyMocks.beginDeferredCommit).toHaveBeenCalledTimes(1);
  expect(annotationMocks.syncFrames).toHaveBeenCalledWith(
    [expect.objectContaining({ frameId: 'frame-1', kind: 'free' })],
    ['frame-1']
  );
  expect(historyMocks.finalizeDeferredCommit).not.toHaveBeenCalled();

  await act(async () => {
    await vi.runAllTimersAsync();
  });

  expect(annotationMocks.syncFrames.mock.invocationCallOrder[0]).toBeLessThan(
    historyMocks.finalizeDeferredCommit.mock.invocationCallOrder[0]!
  );
  expect(historyMocks.finalizeDeferredCommit).toHaveBeenCalledWith(11);
}

async function expectOpenTransactionBypass() {
  const frame = createFrame('frame-1');
  const action = vi.fn(() => {
    framesRef.current = [frame];
  });
  historyMocks.hasOpenTransactions.mockReturnValue(true);

  await renderHarness([]);
  const wrappedAction = latestWithHistoryCommit?.(action);
  wrappedAction?.();

  expect(historyMocks.beginDeferredCommit).not.toHaveBeenCalled();
  expect(annotationMocks.syncFrames).toHaveBeenCalledWith(
    [expect.objectContaining({ frameId: 'frame-1' })],
    ['frame-1']
  );
  expect(historyMocks.cancelDeferredCommit).not.toHaveBeenCalled();
  expect(historyMocks.finalizeDeferredCommit).not.toHaveBeenCalled();
}

function expectHistoryWrappedActions() {
  const withHistoryCommit = vi.fn(<T extends (...args: never[]) => unknown>(action: T) => action);
  const frameManager = createFrameManager();

  const wrapped = createHistoryWrappedFrameManager(frameManager, withHistoryCommit as never);

  expect(withHistoryCommit).toHaveBeenCalledTimes(10);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(1, frameManager.addAutoBlurFrames);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(2, frameManager.addFrame);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(3, frameManager.addFreeFrame);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(4, frameManager.clearAutoBlurFrames);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(5, frameManager.clearFrames);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(6, frameManager.removeFrame);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(7, frameManager.syncFocusOpacity);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(8, frameManager.syncAutoBlurFrames);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(9, frameManager.updateFrame);
  expect(withHistoryCommit).toHaveBeenNthCalledWith(10, frameManager.updateFrameEffect);
  expect(wrapped.updateFrameStepBadge).toBe(frameManager.updateFrameStepBadge);
  expect(wrapped.updateGlobalStepBadgeSettings).toBe(frameManager.updateGlobalStepBadgeSettings);
}

async function expectFrameLifecycleSynchronization() {
  const frame = createFrame('frame-1');
  historyMocks.beginDeferredCommit
    .mockReturnValueOnce(11)
    .mockReturnValueOnce(12)
    .mockReturnValue(13);
  await renderHarness([]);

  const setCurrentFrames = latestWithHistoryCommit?.((next: FrameData[]) => {
    framesRef.current = next;
  });
  setCurrentFrames?.([frame]);
  setCurrentFrames?.([]);
  setCurrentFrames?.([frame]);

  expect(annotationMocks.syncFrames.mock.calls).toEqual([
    [[expect.objectContaining({ frameId: 'frame-1' })], ['frame-1']],
    [[], []],
    [[expect.objectContaining({ frameId: 'frame-1' })], ['frame-1']],
  ]);
}

async function expectActionFailure() {
  const before = [createFrame('before')];
  const changed = [createFrame('changed')];
  const action = vi.fn(() => {
    framesRef.current = changed;
    throw new Error('frame failed');
  });

  await renderHarness(before);
  const wrappedAction = latestWithHistoryCommit?.(action);

  expect(() => wrappedAction?.()).toThrow('frame failed');
  expect(framesRef.current).toBe(before);
  expect(setFrames).toHaveBeenCalledWith(before);
  expect(historyMocks.cancelDeferredCommit).toHaveBeenCalledWith(11);
  expect(annotationMocks.rollbackFailedMutation).toHaveBeenCalledWith({ point: true });
  expect(annotationMocks.syncFrames).not.toHaveBeenCalled();
}

async function expectProducerFailure() {
  const before = [createFrame('before')];
  const changed = [createFrame('changed')];
  annotationMocks.syncFrames.mockImplementationOnce(() => {
    throw new Error('producer failed');
  });

  await renderHarness(before);
  const wrappedAction = latestWithHistoryCommit?.(() => {
    framesRef.current = changed;
  });

  expect(() => wrappedAction?.()).toThrow('producer failed');
  expect(framesRef.current).toBe(before);
  expect(historyMocks.cancelDeferredCommit).toHaveBeenCalledWith(11);
  expect(annotationMocks.rollbackFailedMutation).toHaveBeenCalledWith({ point: true });
}

async function expectUnavailableHistory() {
  const action = vi.fn();
  historyMocks.beginDeferredCommit.mockReturnValue(null);
  await renderHarness([]);

  const wrappedAction = latestWithHistoryCommit?.(action);

  expect(() => wrappedAction?.()).toThrow('Frame history transaction is unavailable');
  expect(action).not.toHaveBeenCalled();
  expect(annotationMocks.captureFailedMutationRollbackPoint).not.toHaveBeenCalled();
  expect(annotationMocks.syncFrames).not.toHaveBeenCalled();
}

async function expectRollbackFailures() {
  historyMocks.cancelDeferredCommit.mockImplementationOnce(() => {
    throw new Error('cancel failed');
  });
  setFrames = vi.fn(() => {
    throw new Error('frame rollback failed');
  });
  annotationMocks.rollbackFailedMutation.mockImplementationOnce(() => {
    throw new Error('annotation rollback failed');
  });
  await renderHarness([]);
  const wrappedAction = latestWithHistoryCommit?.(() => {
    throw new Error('original failure');
  });

  let failure: unknown;
  try {
    wrappedAction?.();
  } catch (error) {
    failure = error;
  }

  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toHaveLength(4);
  expect((failure as AggregateError).errors[0]).toMatchObject({ message: 'original failure' });
}
