// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createPagePreparationHistoryStore } from './store';
import { captureDomStateMap, createDomMutationBatch, hydrateFrameSessionSnapshot } from '.';
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

function getRequiredValue<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function createSnapshotBridge(initialSnapshot = createSnapshot('a')) {
  let current = initialSnapshot;
  const store = createPagePreparationHistoryStore();

  store.registerBridge({
    applySnapshot: (snapshot) => {
      current = cloneSnapshot(snapshot);
    },
    captureSnapshot: () => cloneSnapshot(current),
  });

  return {
    getCurrentSnapshot: () => current,
    setCurrentSnapshot: (snapshot: FrameSessionSnapshot) => {
      current = cloneSnapshot(snapshot);
    },
    store,
  };
}

function verifyCommitUndoRedoOrder() {
  const bridge = createSnapshotBridge();
  const snapshotA = cloneSnapshot(bridge.getCurrentSnapshot());
  const snapshotB = createSnapshot('b');
  const snapshotC = createSnapshot('c');
  const snapshotD = createSnapshot('d');

  bridge.setCurrentSnapshot(snapshotB);
  bridge.store.commitEntry({ after: snapshotB, before: snapshotA });
  bridge.setCurrentSnapshot(snapshotC);
  bridge.store.commitEntry({ after: snapshotC, before: snapshotB });

  expect(bridge.store.getState()).toMatchObject({ canRedo: false, canUndo: true });

  bridge.store.undo();
  expect(bridge.getCurrentSnapshot().frames[0]?.id).toBe('frame-b');
  expect(bridge.store.getState()).toMatchObject({ canRedo: true, canUndo: true });

  bridge.store.redo();
  expect(bridge.getCurrentSnapshot().frames[0]?.id).toBe('frame-c');

  bridge.store.undo();
  bridge.setCurrentSnapshot(snapshotD);
  bridge.store.commitEntry({ after: snapshotD, before: snapshotB });

  expect(bridge.store.getState()).toMatchObject({ canRedo: false, canUndo: true });

  bridge.store.redo();
  expect(bridge.getCurrentSnapshot().frames[0]?.id).toBe('frame-d');
}

function verifyApplyGuard() {
  const store = createPagePreparationHistoryStore();
  let current = createSnapshot('a');

  store.registerBridge({
    applySnapshot: (snapshot) => {
      current = cloneSnapshot(snapshot);
      store.commitEntry({
        after: createSnapshot('ignored-after'),
        before: createSnapshot('ignored-before'),
      });
    },
    captureSnapshot: () => cloneSnapshot(current),
  });

  const snapshotA = cloneSnapshot(current);
  const snapshotB = createSnapshot('b');

  current = cloneSnapshot(snapshotB);
  store.commitEntry({ after: snapshotB, before: snapshotA });
  store.undo();

  expect(current.frames[0]?.id).toBe('frame-a');
  expect(store.getState()).toMatchObject({ canRedo: true, canUndo: false });

  store.redo();
  expect(current.frames[0]?.id).toBe('frame-b');
  expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true });
}

function verifyGroupedDomMutationReplay() {
  const bridge = createSnapshotBridge();
  const target = document.createElement('div');
  target.id = 'history-target';
  target.textContent = 'before';
  document.body.append(target);

  bridge.store.beginTransaction('ai-batch');
  const beforeStates = captureDomStateMap([target]);

  target.textContent = 'after';
  bridge.setCurrentSnapshot(createSnapshot('b'));
  bridge.store.commitTransaction('ai-batch', createDomMutationBatch([target], beforeStates));

  expect(target.textContent).toBe('after');

  bridge.store.undo();
  expect(target.textContent).toBe('before');

  bridge.store.redo();
  expect(target.textContent).toBe('after');
}

function verifyDetachedOverlayFallback() {
  const snapshot = createSnapshot('x');
  const firstFrame = getRequiredValue(snapshot.frames[0], 'snapshot frame');
  snapshot.frames[0] = {
    ...firstFrame,
    linkedElementSelector: '#missing-element',
  };

  const hydrated = hydrateFrameSessionSnapshot(snapshot);

  expect(hydrated.frames).toHaveLength(1);
  expect(hydrated.frames[0]?.id).toBe('frame-x');
  expect(hydrated.frames[0]?.linkedElement).toBeUndefined();
  expect(hydrated.linkedElements.size).toBe(0);
}

function verifyEquivalentSnapshotCommitIsSkipped() {
  const bridge = createSnapshotBridge();
  const snapshot = cloneSnapshot(bridge.getCurrentSnapshot());

  bridge.store.commitEntry({
    after: cloneSnapshot(snapshot),
    before: cloneSnapshot(snapshot),
  });

  expect(bridge.store.getState()).toMatchObject({ canRedo: false, canUndo: false });
}

function verifyInterleavedDeferredCommitUndoRedoTimeline() {
  const bridge = createSnapshotBridge();
  const snapshotA = cloneSnapshot(bridge.getCurrentSnapshot());
  const snapshotB = createSnapshot('b');
  const snapshotC = createSnapshot('c');
  const snapshotD = createSnapshot('d');

  bridge.store.beginTransaction('outer');
  bridge.setCurrentSnapshot(snapshotB);
  const deferredCommitId = bridge.store.beginDeferredCommit();

  expect(deferredCommitId).not.toBeNull();

  bridge.setCurrentSnapshot(snapshotC);
  bridge.store.commitTransaction('outer');
  bridge.setCurrentSnapshot(snapshotD);
  bridge.store.finalizeDeferredCommit(deferredCommitId!);

  expect(bridge.store.hasOpenTransactions()).toBe(false);
  expect(bridge.store.getState()).toMatchObject({ canRedo: false, canUndo: true });

  bridge.store.undo();
  expect(bridge.getCurrentSnapshot().frames[0]?.id).toBe('frame-b');

  bridge.store.undo();
  expect(bridge.getCurrentSnapshot().frames[0]?.id).toBe(snapshotA.frames[0]?.id);

  bridge.store.redo();
  expect(bridge.getCurrentSnapshot().frames[0]?.id).toBe('frame-c');

  bridge.store.redo();
  expect(bridge.getCurrentSnapshot().frames[0]?.id).toBe('frame-d');

  bridge.store.undo();
  expect(bridge.getCurrentSnapshot().frames[0]?.id).toBe('frame-b');

  bridge.store.redo();
  expect(bridge.getCurrentSnapshot().frames[0]?.id).toBe('frame-d');
}

function verifyHostElementAttributesAreRestored() {
  const bridge = createSnapshotBridge();
  const target = document.createElement('div');
  target.id = 'history-attributes-target';
  target.className = 'before';
  target.setAttribute('title', 'Before');
  target.textContent = 'before';
  document.body.append(target);

  bridge.store.beginTransaction('attribute-batch');
  const beforeStates = captureDomStateMap([target]);

  target.className = 'after';
  target.setAttribute('title', 'After');
  target.textContent = 'after';
  bridge.setCurrentSnapshot(createSnapshot('b'));
  bridge.store.commitTransaction('attribute-batch', createDomMutationBatch([target], beforeStates));

  bridge.store.undo();
  expect(target.className).toBe('before');
  expect(target.getAttribute('title')).toBe('Before');

  bridge.store.redo();
  expect(target.className).toBe('after');
  expect(target.getAttribute('title')).toBe('After');
}

function verifyUndoRollbackOnSnapshotFailure() {
  const bridge = createSnapshotBridge();
  const target = document.createElement('div');
  target.id = 'history-rollback-target';
  target.textContent = 'before';
  document.body.append(target);

  bridge.store.beginTransaction('rollback-batch');
  const beforeStates = captureDomStateMap([target]);

  target.textContent = 'after';
  bridge.setCurrentSnapshot(createSnapshot('b'));
  bridge.store.commitTransaction('rollback-batch', createDomMutationBatch([target], beforeStates));

  bridge.store.registerBridge({
    applySnapshot: () => {
      throw new Error('bridge failed');
    },
    captureSnapshot: () => cloneSnapshot(bridge.getCurrentSnapshot()),
  });

  bridge.store.undo();

  expect(target.textContent).toBe('after');
  expect(bridge.store.getState()).toMatchObject({ canRedo: false, canUndo: true });
}

function verifyUndoSkipsMissingDomTargets() {
  const bridge = createSnapshotBridge();
  const target = document.createElement('div');
  target.id = 'history-missing-target';
  target.textContent = 'before';
  document.body.append(target);

  bridge.store.beginTransaction('missing-target-batch');
  const beforeStates = captureDomStateMap([target]);

  target.textContent = 'after';
  bridge.setCurrentSnapshot(createSnapshot('b'));
  bridge.store.commitTransaction(
    'missing-target-batch',
    createDomMutationBatch([target], beforeStates)
  );

  target.remove();
  bridge.store.undo();

  expect(bridge.store.getState()).toMatchObject({ canRedo: false, canUndo: true });
}

describe('pagePreparationHistory store', () => {
  it('tracks commit, undo, redo, and clears redo after a new branch', verifyCommitUndoRedoOrder);
  it('does not record nested commits while an undo or redo apply is in progress', verifyApplyGuard);
  it(
    'groups DOM mutations into a single transaction and replays them on undo and redo',
    verifyGroupedDomMutationReplay
  );
  it(
    'restores frames as detached overlays when linked element locators are missing',
    verifyDetachedOverlayFallback
  );
  it(
    'skips no-op commits when equivalent snapshots are provided by value rather than reference',
    verifyEquivalentSnapshotCommitIsSkipped
  );
  it(
    'replays deferred commits and transaction entries in a stable undo redo timeline',
    verifyInterleavedDeferredCommitUndoRedoTimeline
  );
  it(
    'restores host element attributes during grouped DOM history replay',
    verifyHostElementAttributesAreRestored
  );
  it(
    'rolls back DOM history changes when snapshot restoration fails',
    verifyUndoRollbackOnSnapshotFailure
  );
  it(
    'keeps undo state stable when DOM history targets are missing',
    verifyUndoSkipsMissingDomTargets
  );
});
