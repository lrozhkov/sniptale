import { describe, expect, it, vi } from 'vitest';
import { createHistoryStoreState } from './store-state';
import { createHistoryStoreCommitApi } from './transactions';
import type { FrameSessionSnapshot, PagePreparationSessionSnapshot } from './types';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';

function createFrameSnapshot(label: string): FrameSessionSnapshot {
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
    sessionBorderPreset: DEFAULT_BORDER_PRESET,
    sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
    sessionCalloutStyle: null,
    sessionFocusSettings: { opacity: 0.5, showBorder: false },
    sessionStepBadgeTemplate: null,
    stepBadgeOrder: [[`frame-${label}`, 0]],
  };
}

function createSnapshot(label: string): PagePreparationSessionSnapshot {
  return {
    annotations: {
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextCommentMarker: 1,
      nextCreationOrder: 1,
      schemaVersion: 1,
    },
    frameSession: createFrameSnapshot(label),
  };
}

function cloneSnapshot(snapshot: PagePreparationSessionSnapshot): PagePreparationSessionSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as PagePreparationSessionSnapshot;
}

function createTransactionHarness(initialSnapshot = createSnapshot('a')) {
  let currentSnapshot = cloneSnapshot(initialSnapshot);
  const state = createHistoryStoreState();
  state.bridge = {
    applySnapshot: () => undefined,
    captureSnapshot: () => cloneSnapshot(currentSnapshot),
  };

  return {
    api: createHistoryStoreCommitApi(state),
    setCurrentSnapshot(snapshot: PagePreparationSessionSnapshot) {
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

    expect(harness.api.beginTransaction('frame-edit')).toBe(true);
    expect(harness.api.beginTransaction('frame-edit')).toBe(false);

    expect(harness.state.transactions.size).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    harness.api.cancelTransaction('frame-edit');

    expect(harness.state.transactions.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('refuses a transaction when no snapshot authority is registered', () => {
    const harness = createTransactionHarness();
    harness.state.bridge = null;

    expect(harness.api.beginTransaction('frame-edit')).toBe(false);
    expect(harness.state.transactions.size).toBe(0);
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
    expect(harness.state.past[0]?.before.frameSession.frames[0]?.id).toBe('frame-a');
    expect(harness.state.past[0]?.after.frameSession.frames[0]?.id).toBe('frame-b');
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
