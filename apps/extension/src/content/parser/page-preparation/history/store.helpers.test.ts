// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createPagePreparationHistoryStore } from './store';
import { captureDomStateMap, createDomMutationBatch } from '.';
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

describe('pagePreparationHistory store helpers', () => {
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
