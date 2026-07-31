// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  browserAnnotationSession,
  type BrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { registerDesignReviewCommentDraftFinalizer } from '../session/comment-draft-finalization';
import { teardownDesignReviewSessionAfterUiTransition } from './session-teardown';

function createEvidence(): BrowserAnnotationTargetEvidence {
  return {
    fileLabel: 'browser:session teardown',
    frame: { kind: 'top-document' },
    locator: 'div',
    nodePosition: { x: 0, y: 0 },
    pageUrl: 'https://example.com',
    targetPath: 'html > body > div',
    targetRole: 'generic',
    targetSelector: 'div',
    targetText: 'Target',
    viewport: { height: 720, width: 1280 },
  };
}

function createChangedTarget(): HTMLDivElement {
  const target = document.createElement('div');
  const rect = DOMRect.fromRect({ height: 40, width: 80 });
  Object.defineProperty(target, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  document.body.append(target);
  target.style.color = 'red';
  browserAnnotationSession.recordPropertyChanges({
    changes: [
      {
        after: { priority: '', value: 'red' },
        before: { priority: '', value: '' },
        order: 0,
        property: 'color',
      },
    ],
    evidence: createEvidence(),
    target,
  });
  return target;
}

function createZeroSizedChangedTarget(): HTMLDivElement {
  const target = document.createElement('div');
  const rect = DOMRect.fromRect({ height: 0, width: 0 });
  Object.defineProperty(target, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  document.body.append(target);
  target.style.width = '0px';
  browserAnnotationSession.recordPropertyChanges({
    changes: [
      {
        after: { priority: '', value: '0px' },
        before: { priority: '', value: '' },
        order: 1,
        property: 'width',
      },
    ],
    evidence: createEvidence(),
    target,
  });
  return target;
}

function createMultiPropertyChangedTarget(): HTMLDivElement {
  const target = document.createElement('div');
  const rect = DOMRect.fromRect({ height: 40, width: 80 });
  Object.defineProperty(target, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  document.body.append(target);
  target.style.color = 'red';
  target.style.fontSize = '18px';
  browserAnnotationSession.recordPropertyChanges({
    changes: [
      {
        after: { priority: '', value: 'red' },
        before: { priority: '', value: '' },
        order: 0,
        property: 'color',
      },
      {
        after: { priority: '', value: '18px' },
        before: { priority: '', value: '' },
        order: 1,
        property: 'font-size',
      },
    ],
    evidence: createEvidence(),
    target,
  });
  return target;
}

function forceResetAndRollbackFailure(target: HTMLDivElement, colorSetFailures: number): void {
  const originalRemoveProperty = target.style.removeProperty.bind(target.style);
  vi.spyOn(target.style, 'removeProperty').mockImplementation((property) =>
    property === 'font-size'
      ? target.style.getPropertyValue(property)
      : originalRemoveProperty(property)
  );
  const originalSetProperty = target.style.setProperty.bind(target.style);
  let failedColorSets = 0;
  vi.spyOn(target.style, 'setProperty').mockImplementation((property, value, priority) => {
    if (property === 'color' && value === 'red' && failedColorSets < colorSetFailures) {
      failedColorSets += 1;
      return;
    }
    originalSetProperty(property, value, priority);
  });
}

function forceColorRestoreFailure(target: HTMLDivElement, failureCount: number): void {
  const originalSetProperty = target.style.setProperty.bind(target.style);
  let failures = 0;
  vi.spyOn(target.style, 'setProperty').mockImplementation((property, value, priority) => {
    if (property === 'color' && value === 'red' && failures < failureCount) {
      failures += 1;
      return;
    }
    originalSetProperty(property, value, priority);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  pagePreparationHistory.clear();
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('restores Design Review styles before clearing session state after the UI transition', async () => {
  const target = createChangedTarget();
  const transitionUi = vi.fn();
  const teardown = teardownDesignReviewSessionAfterUiTransition(transitionUi);

  await vi.runAllTimersAsync();
  await teardown;

  expect(transitionUi).toHaveBeenCalledOnce();
  expect(target.style.getPropertyValue('color')).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
});

it('clears comment-only Design Review feedback after the UI transition', async () => {
  const target = document.createElement('button');
  document.body.append(target);
  browserAnnotationSession.setComment({
    comment: 'Make the action clearer',
    evidence: createEvidence(),
    target,
  });
  const transitionUi = vi.fn();
  const teardown = teardownDesignReviewSessionAfterUiTransition(transitionUi);

  await vi.runAllTimersAsync();
  await teardown;

  expect(transitionUi).toHaveBeenCalledOnce();
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
});

it('preserves the session and mode when the active comment draft cannot be saved', async () => {
  const target = createChangedTarget();
  const transitionUi = vi.fn();
  const unregister = registerDesignReviewCommentDraftFinalizer(() => false);

  await expect(teardownDesignReviewSessionAfterUiTransition(transitionUi)).rejects.toThrow(
    'comment draft could not be saved'
  );

  unregister();
  expect(transitionUi).not.toHaveBeenCalled();
  expect(target.style.getPropertyValue('color')).toBe('red');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(1);
});

it('preserves mode and recovery evidence when a changed style endpoint is stale', async () => {
  const target = createChangedTarget();
  const transitionUi = vi.fn();
  target.style.color = 'blue';

  await expect(teardownDesignReviewSessionAfterUiTransition(transitionUi)).rejects.toThrow(
    'stale-target-state'
  );

  expect(transitionUi).not.toHaveBeenCalled();
  expect(target.style.getPropertyValue('color')).toBe('blue');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(1);
});

it('compensates earlier style restorations when a later target cannot be restored', async () => {
  const firstTarget = createChangedTarget();
  const staleTarget = createChangedTarget();
  const transitionUi = vi.fn();
  staleTarget.style.color = 'blue';

  await expect(teardownDesignReviewSessionAfterUiTransition(transitionUi)).rejects.toThrow(
    'stale-target-state'
  );

  expect(transitionUi).not.toHaveBeenCalled();
  expect(firstTarget.style.getPropertyValue('color')).toBe('red');
  expect(staleTarget.style.getPropertyValue('color')).toBe('blue');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(2);
});

it('retries a factual preview batch when earlier-target compensation fails', async () => {
  const firstTarget = createChangedTarget();
  const staleTarget = createChangedTarget();
  const transitionUi = vi.fn();
  forceColorRestoreFailure(firstTarget, 1);
  staleTarget.style.color = 'blue';

  await expect(teardownDesignReviewSessionAfterUiTransition(transitionUi)).rejects.toThrow(
    'compensation:mutation-failed'
  );

  expect(transitionUi).not.toHaveBeenCalled();
  expect(firstTarget.style.getPropertyValue('color')).toBe('red');
  expect(staleTarget.style.getPropertyValue('color')).toBe('blue');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(2);
});

it('retains failed compensation facts and permits a coherent retry', async () => {
  const firstTarget = createChangedTarget();
  const staleTarget = createChangedTarget();
  const firstAnnotationId = browserAnnotationSession.getAnnotationId(firstTarget);
  const transitionUi = vi.fn();
  forceColorRestoreFailure(firstTarget, Number.POSITIVE_INFINITY);
  staleTarget.style.color = 'blue';

  await expect(teardownDesignReviewSessionAfterUiTransition(transitionUi)).rejects.toThrow(
    'compensation:current-recovery:mutation-failed'
  );

  expect(transitionUi).not.toHaveBeenCalled();
  expect(firstTarget.style.getPropertyValue('color')).toBe('');
  expect(browserAnnotationSession.getLiveTarget(firstAnnotationId ?? -1)).toBeNull();
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(1);

  staleTarget.style.color = 'red';
  const retryTransition = vi.fn();
  const retry = teardownDesignReviewSessionAfterUiTransition(retryTransition);
  await vi.runAllTimersAsync();
  await retry;

  expect(retryTransition).toHaveBeenCalledOnce();
  expect(staleTarget.style.getPropertyValue('color')).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
});

it('compensates earlier style restorations when a later target is detached', async () => {
  const firstTarget = createChangedTarget();
  const detachedTarget = createChangedTarget();
  const transitionUi = vi.fn();
  detachedTarget.remove();

  await expect(teardownDesignReviewSessionAfterUiTransition(transitionUi)).rejects.toThrow(
    'unavailable for restoration'
  );

  expect(transitionUi).not.toHaveBeenCalled();
  expect(firstTarget.style.getPropertyValue('color')).toBe('red');
  expect(detachedTarget.style.getPropertyValue('color')).toBe('red');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(2);
});

it('restores an owner-authored target after Design Review makes it zero-sized', async () => {
  const target = createZeroSizedChangedTarget();
  const transitionUi = vi.fn();
  const teardown = teardownDesignReviewSessionAfterUiTransition(transitionUi);

  await vi.runAllTimersAsync();
  await teardown;

  expect(transitionUi).toHaveBeenCalledOnce();
  expect(target.style.getPropertyValue('width')).toBe('');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
});

it('recovers the current source endpoint after reset and rollback both fail', async () => {
  const firstTarget = createChangedTarget();
  const failedTarget = createMultiPropertyChangedTarget();
  const transitionUi = vi.fn();
  forceResetAndRollbackFailure(failedTarget, 1);

  await expect(teardownDesignReviewSessionAfterUiTransition(transitionUi)).rejects.toThrow(
    'rollback-failed'
  );

  expect(transitionUi).not.toHaveBeenCalled();
  expect(firstTarget.style.getPropertyValue('color')).toBe('red');
  expect(failedTarget.style.getPropertyValue('color')).toBe('red');
  expect(failedTarget.style.getPropertyValue('font-size')).toBe('18px');
  expect(browserAnnotationSession.captureSnapshot().domRecords).toHaveLength(2);
});

it('retains factual recovery evidence when immediate current-batch recovery also fails', async () => {
  const failedTarget = createMultiPropertyChangedTarget();
  const transitionUi = vi.fn();
  forceResetAndRollbackFailure(failedTarget, Number.POSITIVE_INFINITY);

  await expect(teardownDesignReviewSessionAfterUiTransition(transitionUi)).rejects.toThrow(
    'current-recovery:mutation-failed'
  );

  expect(transitionUi).not.toHaveBeenCalled();
  expect(failedTarget.style.getPropertyValue('color')).toBe('');
  expect(failedTarget.style.getPropertyValue('font-size')).toBe('18px');
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.propertyChanges).toEqual([
    expect.objectContaining({
      after: { priority: '', value: '18px' },
      before: { priority: '', value: '' },
      property: 'font-size',
    }),
  ]);
});
