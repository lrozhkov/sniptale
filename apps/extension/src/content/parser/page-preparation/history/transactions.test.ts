import { describe, expect, it, vi } from 'vitest';
import { createHistoryStoreInternals } from './store.internals';
import { createHistoryStoreCommitApi } from './transactions';
import type { FrameSessionSnapshot } from './types';

function createSnapshot(label: string): FrameSessionSnapshot {
  return {
    frames: [
      {
        height: 40,
        id: `frame-${label}`,
        linkedElementSelector: `#${label}`,
        width: 80,
        x: label.charCodeAt(0),
        y: 10,
      } as FrameSessionSnapshot['frames'][number],
    ],
    globalEffectMode: 'border',
    globalStepBadgeSettings: { autoMode: true },
    sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
    sessionCalloutStyle: null,
    sessionFocusSettings: { opacity: 0.5, showBorder: false },
    sessionStepBadgeTemplate: null,
    stepBadgeOrder: [[`frame-${label}`, 0]],
  };
}

function cloneSnapshot(snapshot: FrameSessionSnapshot): FrameSessionSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as FrameSessionSnapshot;
}

function createTransactionHarness(initialSnapshot = createSnapshot('a')) {
  let currentSnapshot = cloneSnapshot(initialSnapshot);
  const state = createHistoryStoreInternals();
  state.bridge = {
    applySnapshot: () => undefined,
    captureSnapshot: () => cloneSnapshot(currentSnapshot),
  };

  return {
    api: createHistoryStoreCommitApi(state),
    setCurrentSnapshot(snapshot: FrameSessionSnapshot) {
      currentSnapshot = cloneSnapshot(snapshot);
    },
    state,
  };
}

describe('page-preparation-history transaction lifecycle', () => {
  it('keeps one open transaction per key until that transaction is cancelled', () => {
    const harness = createTransactionHarness();
    const listener = vi.fn();
    harness.state.listeners.add(listener);

    harness.api.beginTransaction('frame-edit');
    harness.api.beginTransaction('frame-edit');

    expect(harness.state.transactions.size).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    harness.api.cancelTransaction('frame-edit');

    expect(harness.state.transactions.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('drops a deferred commit when history is already applying during finalize', () => {
    const harness = createTransactionHarness();

    const commitId = harness.api.beginDeferredCommit();

    expect(commitId).not.toBeNull();

    harness.state.isApplying = true;
    harness.api.finalizeDeferredCommit(commitId!);

    expect(harness.state.deferredCommits.size).toBe(0);
    expect(harness.state.past).toHaveLength(0);
  });
});

describe('page-preparation-history transaction commits', () => {
  it('records a committed transaction as one history entry and clears the open transaction', () => {
    const harness = createTransactionHarness();

    harness.api.beginTransaction('frame-edit');
    harness.setCurrentSnapshot(createSnapshot('b'));
    harness.api.commitTransaction('frame-edit');

    expect(harness.state.transactions.size).toBe(0);
    expect(harness.state.past).toHaveLength(1);
    expect(harness.state.past[0]?.before.frames[0]?.id).toBe('frame-a');
    expect(harness.state.past[0]?.after.frames[0]?.id).toBe('frame-b');
  });

  it('publishes when an open transaction closes without a history entry', () => {
    const harness = createTransactionHarness();
    const listener = vi.fn();
    harness.state.listeners.add(listener);

    harness.api.beginTransaction('frame-edit');
    listener.mockClear();
    harness.state.bridge = null;
    harness.api.commitTransaction('frame-edit');

    expect(harness.state.transactions.size).toBe(0);
    expect(harness.state.past).toHaveLength(0);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('publishes when a no-op transaction closes without pushing a history entry', () => {
    const harness = createTransactionHarness();
    const listener = vi.fn();
    harness.state.listeners.add(listener);

    harness.api.beginTransaction('frame-edit');
    listener.mockClear();
    harness.api.commitTransaction('frame-edit');

    expect(harness.state.transactions.size).toBe(0);
    expect(harness.state.past).toHaveLength(0);
    expect(listener).toHaveBeenCalledOnce();
  });
});
