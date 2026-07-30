// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createPagePreparationHistoryStore } from './store';
import type { PagePreparationHistoryDomEffect, PagePreparationSessionSnapshot } from './types';

function createSnapshot(frameId: string): PagePreparationSessionSnapshot {
  return {
    annotations: {
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextMarkerNumber: 1,
      nextCreationOrder: 1,
      schemaVersion: 1,
    },
    frameSession: {
      frames: [],
      globalEffectMode: 'border',
      globalStepBadgeSettings: { autoMode: true },
      sessionBorderPreset: DEFAULT_BORDER_PRESET,
      sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
      sessionCalloutStyle: null,
      sessionFocusSettings: { opacity: 0.5, showBorder: false },
      sessionStepBadgeTemplate: null,
      stepBadgeOrder: [[frameId, 0]],
    },
  };
}

it('keeps history and snapshot state unchanged when an owner DOM effect fails', () => {
  const store = createPagePreparationHistoryStore();
  let current = createSnapshot('before');
  const applySnapshot = vi.fn((snapshot: PagePreparationSessionSnapshot) => {
    current = snapshot;
  });
  store.registerBridge({ applySnapshot, captureSnapshot: () => current });
  const effect: PagePreparationHistoryDomEffect = {
    apply: vi.fn(() => ({ failures: ['detached-target'], success: false })),
    hasChanges: true,
  };

  store.beginTransaction('effect');
  current = createSnapshot('after');
  store.commitTransaction('effect', null, effect);
  store.undo();

  expect(applySnapshot).not.toHaveBeenCalled();
  expect(current.frameSession.stepBadgeOrder).toEqual([['after', 0]]);
  expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true });
});

it('rolls an owner DOM effect forward again when snapshot undo fails', () => {
  const store = createPagePreparationHistoryStore();
  let current = createSnapshot('before');
  let effectState = 'after';
  const effect: PagePreparationHistoryDomEffect = {
    apply: vi.fn((direction) => {
      effectState = direction === 'undo' ? 'before' : 'after';
      return { failures: [], success: true };
    }),
    hasChanges: true,
  };
  store.registerBridge({
    applySnapshot: vi
      .fn<(snapshot: PagePreparationSessionSnapshot) => void>()
      .mockImplementationOnce(() => {
        throw new Error('snapshot failed');
      })
      .mockImplementation((snapshot) => {
        current = snapshot;
      }),
    captureSnapshot: () => current,
  });

  store.beginTransaction('effect');
  current = createSnapshot('after');
  store.commitTransaction('effect', null, effect);
  store.undo();

  expect(effect.apply).toHaveBeenNthCalledWith(1, 'undo');
  expect(effect.apply).toHaveBeenNthCalledWith(2, 'redo');
  expect(effectState).toBe('after');
  expect(current.frameSession.stepBadgeOrder).toEqual([['after', 0]]);
  expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true });
});

it('replaces a failed owner replay with one factual recovery-only entry', () => {
  const store = createPagePreparationHistoryStore();
  let current = createSnapshot('before');
  let effectState = 'after';
  const recoveryEffect: PagePreparationHistoryDomEffect = {
    apply: vi.fn((direction) => {
      expect(direction).toBe('undo');
      effectState = 'after';
      return { failures: [], success: true };
    }),
    hasChanges: true,
    recoveryOnly: true,
  };
  const effect: PagePreparationHistoryDomEffect = {
    apply: vi.fn(() => {
      effectState = 'residual';
      return {
        failures: ['rollback-failed'],
        recovery: { effect: recoveryEffect },
        success: false,
      };
    }),
    hasChanges: true,
  };
  store.registerBridge({
    applySnapshot: (snapshot) => {
      current = snapshot;
    },
    captureSnapshot: () => current,
  });

  store.beginTransaction('effect');
  current = createSnapshot('after');
  store.commitTransaction('effect', null, effect);
  store.undo();

  expect(effectState).toBe('residual');
  expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true });
  store.undo();
  expect(effectState).toBe('after');
  expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true });
});

it('keeps factual recovery when snapshot apply and reverse owner compensation both fail', () => {
  const store = createPagePreparationHistoryStore();
  let current = createSnapshot('before');
  let effectState = 'after';
  const recoveryEffect: PagePreparationHistoryDomEffect = {
    apply: vi.fn(() => {
      effectState = 'after';
      return { failures: [], success: true };
    }),
    hasChanges: true,
    recoveryOnly: true,
  };
  const effect: PagePreparationHistoryDomEffect = {
    apply: vi.fn((direction) => {
      if (direction === 'undo') {
        effectState = 'before';
        return { failures: [], success: true };
      }
      effectState = 'residual';
      return {
        failures: ['rollback-failed'],
        recovery: { effect: recoveryEffect },
        success: false,
      };
    }),
    hasChanges: true,
  };
  const applySnapshot = vi.fn<(snapshot: PagePreparationSessionSnapshot) => void>(() => {
    throw new Error('snapshot failed');
  });
  store.registerBridge({ applySnapshot, captureSnapshot: () => current });

  store.beginTransaction('effect');
  current = createSnapshot('after');
  store.commitTransaction('effect', null, effect);
  store.undo();

  expect(effect.apply).toHaveBeenNthCalledWith(1, 'undo');
  expect(effect.apply).toHaveBeenNthCalledWith(2, 'redo');
  expect(effectState).toBe('residual');
  expect(applySnapshot).toHaveBeenCalledOnce();
  expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true });

  applySnapshot.mockImplementation((snapshot) => {
    current = snapshot;
  });
  store.undo();
  expect(effectState).toBe('after');
  expect(current.frameSession.stepBadgeOrder).toEqual([['after', 0]]);
  expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true });
});

it('retries only the safe snapshot when recovery-only undo snapshot application fails', () => {
  const store = createPagePreparationHistoryStore();
  let current = createSnapshot('residual');
  let effectState = 'residual';
  const recoveryEffect: PagePreparationHistoryDomEffect = {
    apply: vi.fn((direction) => {
      if (direction === 'redo') {
        return { failures: ['recovery-redo-disabled'], success: false };
      }
      effectState = 'safe';
      return { failures: [], success: true };
    }),
    hasChanges: true,
    recoveryOnly: true,
  };
  const safeSnapshot = createSnapshot('safe');
  const applySnapshot = vi
    .fn<(snapshot: PagePreparationSessionSnapshot) => void>()
    .mockImplementationOnce(() => {
      throw new Error('snapshot failed');
    })
    .mockImplementation((snapshot) => {
      current = snapshot;
    });
  store.registerBridge({ applySnapshot, captureSnapshot: () => current });
  store.commitEntry({
    after: current,
    before: safeSnapshot,
    domEffect: recoveryEffect,
  });

  store.undo();
  expect(effectState).toBe('safe');
  expect(recoveryEffect.apply).toHaveBeenNthCalledWith(1, 'undo');
  expect(recoveryEffect.apply).toHaveBeenNthCalledWith(2, 'redo');
  expect(current.frameSession.stepBadgeOrder).toEqual([['residual', 0]]);
  expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true });

  store.undo();
  expect(recoveryEffect.apply).toHaveBeenCalledTimes(2);
  expect(current.frameSession.stepBadgeOrder).toEqual([['safe', 0]]);
  expect(store.getState()).toMatchObject({ canRedo: false, canUndo: false });
});
