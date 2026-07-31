// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyDomMutationBatch: vi.fn(() => ({ missingLocators: [], success: true })),
  beginTransaction: vi.fn(() => true),
  cancelTransaction: vi.fn(),
  captureDomStateMap: vi.fn(() => new Map([['before', { attributes: {}, html: 'Before' }]])),
  captureFailedMutationRollbackPoint: vi.fn(() => ({ point: true })),
  captureText: vi.fn((target: HTMLElement) => ({
    before: target.textContent ?? '',
    evidence: { targetSelector: '#target' },
    target,
  })),
  commitTransaction: vi.fn(() => true),
  createDomMutationBatch: vi.fn((elements: Iterable<HTMLElement>) => ({
    patches: Array.from(elements, (target) => ({
      after: { attributes: { 'data-sniptale-id': 'history-1' }, html: target.innerHTML },
      before: { attributes: { 'data-sniptale-id': 'history-1' }, html: target.innerHTML },
      changed: true,
      locator: '[data-sniptale-id="history-1"]',
      target,
    })),
  })),
  publishText: vi.fn(),
  rollbackFailedMutation: vi.fn(() => true),
}));

vi.mock('../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../parser/page-preparation/history')>()),
  applyDomMutationBatch: mocks.applyDomMutationBatch,
  captureDomStateMap: mocks.captureDomStateMap,
  createDomMutationBatch: mocks.createDomMutationBatch,
  pagePreparationHistory: {
    beginTransaction: mocks.beginTransaction,
    cancelTransaction: mocks.cancelTransaction,
    commitTransaction: mocks.commitTransaction,
  },
}));

vi.mock('../../parser/page-preparation/annotations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../parser/page-preparation/annotations')>()),
  browserAnnotationSession: {
    captureFailedMutationRollbackPoint: mocks.captureFailedMutationRollbackPoint,
    rollbackFailedMutation: mocks.rollbackFailedMutation,
  },
}));

vi.mock('./annotation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./annotation')>()),
  captureQuickEditTextAnnotation: mocks.captureText,
  publishCommittedQuickEditTextChanges: mocks.publishText,
}));

import { createQuickEditHistoryTracker } from './history';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
  mocks.beginTransaction.mockReturnValue(true);
  mocks.commitTransaction.mockReturnValue(true);
  mocks.applyDomMutationBatch.mockReturnValue({ missingLocators: [], success: true });
  mocks.rollbackFailedMutation.mockReturnValue(true);
});

function appendTarget(text = 'Before'): HTMLElement {
  const target = document.createElement('p');
  target.textContent = text;
  document.body.append(target);
  return target;
}

it('captures text separately from DOM state before opening the transaction', () => {
  const tracker = createQuickEditHistoryTracker();
  const target = appendTarget();

  tracker.begin(target, 'editable-1');

  expect(mocks.captureText).toHaveBeenCalledWith(target);
  expect(mocks.captureDomStateMap).toHaveBeenCalledWith([target]);
  expect(mocks.beginTransaction).toHaveBeenCalledWith('quick-edit:editable-1');
});

it('publishes committed text before finalizing the same DOM history transaction', () => {
  const tracker = createQuickEditHistoryTracker();
  const target = appendTarget();
  tracker.begin(target, 'editable-1');
  target.textContent = 'After';

  expect(tracker.commit(target, 'editable-1')).toBe(true);

  expect(mocks.publishText).toHaveBeenCalledWith([
    { after: 'After', capture: expect.objectContaining({ before: 'Before', target }) },
  ]);
  expect(mocks.createDomMutationBatch).toHaveBeenCalledWith([target], expect.any(Map));
  expect(mocks.commitTransaction).toHaveBeenCalledWith('quick-edit:editable-1', {
    patches: [expect.objectContaining({ changed: true })],
  });
  expect(mocks.publishText.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.commitTransaction.mock.invocationCallOrder[0]!
  );
});

it('rejects unavailable history before editing can start', () => {
  const tracker = createQuickEditHistoryTracker();
  mocks.beginTransaction.mockReturnValueOnce(false);

  expect(() => tracker.begin(appendTarget(), 'editable-1')).toThrow(
    'Quick Edit history transaction is unavailable'
  );
  expect(mocks.publishText).not.toHaveBeenCalled();
  expect(mocks.captureText).not.toHaveBeenCalled();
});

it('cancels the open transaction when target evidence capture fails', () => {
  const tracker = createQuickEditHistoryTracker();
  mocks.captureText.mockImplementationOnce(() => {
    throw new Error('evidence failed');
  });

  expect(() => tracker.begin(appendTarget(), 'editable-1')).toThrow('evidence failed');
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit:editable-1');
  expect(mocks.publishText).not.toHaveBeenCalled();
});

it('cancels without publishing when DOM batch construction fails', () => {
  const tracker = createQuickEditHistoryTracker();
  const target = appendTarget();
  tracker.begin(target, 'editable-1');
  mocks.createDomMutationBatch.mockImplementationOnce(() => {
    throw new Error('batch failed');
  });

  expect(() => tracker.commit(target, 'editable-1')).toThrow('batch failed');
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit:editable-1');
  expect(mocks.publishText).not.toHaveBeenCalled();
});

it('cancels disconnected and missing transactions without publishing', () => {
  const tracker = createQuickEditHistoryTracker();
  const target = appendTarget();
  tracker.begin(target, 'editable-1');
  target.remove();

  expect(tracker.commit(target, 'editable-1')).toBe(false);
  expect(tracker.commit(target, 'editable-1')).toBe(false);
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit:editable-1');
  expect(mocks.publishText).not.toHaveBeenCalled();
});

it('rejects a connected element that only copies another edit id', () => {
  const tracker = createQuickEditHistoryTracker();
  const original = appendTarget('Original');
  const lookalike = appendTarget('Lookalike');
  tracker.begin(original, 'editable-1');

  expect(() => tracker.commit(lookalike, 'editable-1')).toThrow(
    'Quick Edit history target does not match the captured element'
  );
  expect(mocks.createDomMutationBatch).not.toHaveBeenCalled();
  expect(mocks.publishText).not.toHaveBeenCalled();
});

it('compensates when the keyed history lease is lost before finalization', () => {
  const tracker = createQuickEditHistoryTracker();
  const target = appendTarget();
  tracker.begin(target, 'editable-1');
  target.textContent = 'After';
  mocks.commitTransaction.mockReturnValueOnce(false);

  expect(() => tracker.commit(target, 'editable-1')).toThrow(
    'Quick Edit history transaction was lost before commit'
  );
  expect(mocks.applyDomMutationBatch).toHaveBeenCalledWith(
    { patches: [expect.objectContaining({ changed: true })] },
    'undo'
  );
  expect(mocks.rollbackFailedMutation).toHaveBeenCalledWith({ point: true });
});

it('rolls back DOM and session evidence when history finalization fails', () => {
  const tracker = createQuickEditHistoryTracker();
  const target = appendTarget();
  tracker.begin(target, 'editable-1');
  target.textContent = 'After';
  const failure = new Error('history capture failed');
  mocks.commitTransaction.mockImplementationOnce(() => {
    throw failure;
  });

  expect(() => tracker.commit(target, 'editable-1')).toThrow(failure);
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit:editable-1');
  expect(mocks.applyDomMutationBatch).toHaveBeenCalledWith(
    { patches: [expect.objectContaining({ changed: true })] },
    'undo'
  );
  expect(mocks.rollbackFailedMutation).toHaveBeenCalledWith({ point: true });
});

it('attempts every compensation step and surfaces aggregate rollback failures', () => {
  const tracker = createQuickEditHistoryTracker();
  const target = appendTarget();
  tracker.begin(target, 'editable-1');
  target.textContent = 'After';
  mocks.commitTransaction.mockImplementationOnce(() => {
    throw new Error('history capture failed');
  });
  mocks.cancelTransaction.mockImplementationOnce(() => {
    throw new Error('cancel failed');
  });
  mocks.applyDomMutationBatch.mockImplementationOnce(() => {
    throw new Error('DOM rollback failed');
  });
  mocks.rollbackFailedMutation.mockReturnValueOnce(false);

  expect(() => tracker.commit(target, 'editable-1')).toThrow(AggregateError);
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit:editable-1');
  expect(mocks.applyDomMutationBatch).toHaveBeenCalledOnce();
  expect(mocks.rollbackFailedMutation).toHaveBeenCalledOnce();
});

it('cancels only transactions with an editable id', () => {
  const tracker = createQuickEditHistoryTracker();

  tracker.cancel(undefined);
  tracker.cancel('editable-1');

  expect(mocks.cancelTransaction).toHaveBeenCalledOnce();
  expect(mocks.cancelTransaction).toHaveBeenCalledWith('quick-edit:editable-1');
});
